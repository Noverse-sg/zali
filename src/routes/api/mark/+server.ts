import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY, KIE_API_KEY, DASHSCOPE_API_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// DashScope (Qwen) API endpoint for analysis
const DASHSCOPE_CHAT_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

// Kie.ai API endpoints for image marking (Nano Banana Edit)
const KIE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const KIE_RESULT_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

interface ContextFile {
	name: string;
	mimeType: string;
	data: string; // base64
}

interface TokenUsage {
	promptTokens: number;
	candidatesTokens: number;
	totalTokens: number;
}

// Timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
		)
	]);
}

export const POST: RequestHandler = async ({ request }) => {
	// Parse request body once at the start
	let submissionId: string | undefined;
	let imageBase64: string | undefined;
	let modelAnswer: string | undefined;
	let maxPoints: number | undefined;
	let contextFiles: ContextFile[] = [];
	let answerKeyUrl: string | undefined;
	let answerKeyType: string | undefined;

	try {
		const body = await request.json();
		submissionId = body.submissionId;
		imageBase64 = body.imageBase64;
		modelAnswer = body.modelAnswer;
		maxPoints = body.maxPoints;
		contextFiles = body.contextFiles || [];
		answerKeyUrl = body.answerKeyUrl || undefined;
		answerKeyType = body.answerKeyType || undefined;
	} catch (err) {
		console.error('[Marking] Failed to parse request body:', err);
		return json({ success: false, error: 'Invalid request body' }, { status: 400 });
	}

	if (!submissionId || !imageBase64) {
		return json({ success: false, error: 'Missing required fields' }, { status: 400 });
	}

	// Must have either a model answer text or an answer key file
	if (!modelAnswer && !answerKeyUrl) {
		return json({ success: false, error: 'Missing model answer or answer key' }, { status: 400 });
	}

	try {
		// Update submission status to marking
		const { error: updateError } = await supabaseAdmin
			.from('submissions')
			.update({ status: 'marking' })
			.eq('id', submissionId);

		if (updateError) {
			console.error('[Marking] Failed to update status to marking:', updateError);
		}

		// If we have an answer key file URL, fetch it and add as context
		if (answerKeyUrl && answerKeyType) {
			try {
				console.log(`[Marking] Fetching answer key file: ${answerKeyUrl}`);
				const fileResponse = await fetch(answerKeyUrl);
				if (fileResponse.ok) {
					const arrayBuffer = await fileResponse.arrayBuffer();
					const base64Data = Buffer.from(arrayBuffer).toString('base64');
					contextFiles.push({
						name: 'answer_key',
						mimeType: answerKeyType,
						data: base64Data
					});
				} else {
					console.warn('[Marking] Failed to fetch answer key file:', fileResponse.status);
				}
			} catch (err) {
				console.warn('[Marking] Error fetching answer key file:', err);
			}
		}

		// Step 1: Analyze the student's answer using Qwen 3.5 Plus via DashScope
		// Timeout after 180 seconds (multimodal image analysis can be slow)
		const analysisResult = await withTimeout(
			analyzeStudentAnswer(imageBase64, modelAnswer || '', maxPoints ?? 10, contextFiles),
			180000,
			'Analysis'
		);

		console.log(`[Marking] Analysis tokens - prompt: ${analysisResult.usage.promptTokens}, output: ${analysisResult.usage.candidatesTokens}, total: ${analysisResult.usage.totalTokens}`);

		// Update submission with analysis results immediately
		const { error: resultError } = await supabaseAdmin
			.from('submissions')
			.update({
				score: analysisResult.score,
				feedback: analysisResult.feedback,
				mistakes: analysisResult.mistakes,
				status: 'completed',
				marked_at: new Date().toISOString()
			})
			.eq('id', submissionId);

		if (resultError) {
			console.error('[Marking] Failed to update submission with results:', resultError);
		}

		// Step 2: Generate marked image in background using Nano Banana Edit
		if (analysisResult.instructions) {
			markImageInBackground(submissionId, analysisResult.instructions);
		}

		return json({
			success: true,
			score: analysisResult.score,
			feedback: analysisResult.feedback,
			mistakes: analysisResult.mistakes,
			markedImageUrl: null // Will be updated async
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[Marking] Error:', errorMessage);

		// Update submission status to error
		if (submissionId) {
			const { error: statusError } = await supabaseAdmin
				.from('submissions')
				.update({
					status: 'error',
					feedback: `Marking failed: ${errorMessage}`
				})
				.eq('id', submissionId);

			if (statusError) {
				console.error('[Marking] Failed to update error status:', statusError);
			}
		}

		return json(
			{ success: false, error: 'Marking failed. Please try again.' },
			{ status: 500 }
		);
	}
};

/**
 * STEP 1: Analyze student answer using Qwen 3.5 Plus via DashScope (OpenAI-compatible chat API)
 */
async function analyzeStudentAnswer(
	imageBase64: string,
	modelAnswer: string,
	maxPoints: number,
	contextFiles: ContextFile[]
): Promise<{ score: number; feedback: string; mistakes: string[]; instructions: string | null; usage: TokenUsage }> {
	// Build message content array (OpenAI-compatible multimodal format)
	const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

	// Build prompt
	let promptText: string;
	if (modelAnswer) {
		promptText = `You are marking a student's handwritten exam answer (image attached).

MODEL ANSWER: ${modelAnswer}
MAX POINTS: ${maxPoints}

Analyze the student's answer in the image and return ONLY this JSON:
{"score": <number 0-${maxPoints}>, "feedback": "<1-2 sentences>", "mistakes": ["<mistake1>", "<mistake2>"], "markingInstructions": "<brief instructions for red annotations on the image>"}`;
	} else {
		promptText = `You are marking a student's handwritten exam answer (image attached).

The answer key / model answer is provided as an attached file (image or PDF). Compare the student's handwritten answer against the answer key.
MAX POINTS: ${maxPoints}

Analyze the student's answer in the image and return ONLY this JSON:
{"score": <number 0-${maxPoints}>, "feedback": "<1-2 sentences>", "mistakes": ["<mistake1>", "<mistake2>"], "markingInstructions": "<brief instructions for red annotations on the image>"}`;
	}

	content.push({ type: 'text', text: promptText });

	// Add context files (answer key images/PDFs/text)
	for (const ctx of contextFiles) {
		if (ctx.mimeType.startsWith('image/') || ctx.mimeType === 'application/pdf') {
			content.push({
				type: 'image_url',
				image_url: { url: `data:${ctx.mimeType};base64,${ctx.data}` }
			});
		} else if (ctx.mimeType.startsWith('text/') || ctx.mimeType === 'application/json') {
			const text = Buffer.from(ctx.data, 'base64').toString('utf-8');
			content.push({ type: 'text', text: `\n=== ${ctx.name} ===\n${text}` });
		}
	}

	// Add student image
	content.push({
		type: 'image_url',
		image_url: { url: `data:image/png;base64,${imageBase64}` }
	});

	console.log('[Marking] Calling Qwen 3.5 Plus via DashScope for analysis...');

	let response;
	try {
		response = await fetch(DASHSCOPE_CHAT_URL, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'qwen3.5-plus',
				messages: [{ role: 'user', content }],
				stream: false
			})
		});
	} catch (apiError) {
		console.error('[Marking] DashScope API error:', apiError);
		throw new Error(`DashScope API call failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
	}

	if (!response.ok) {
		const errBody = await response.text();
		console.error('[Marking] DashScope API error response:', errBody);
		throw new Error(`DashScope API returned ${response.status}: ${errBody}`);
	}

	const data = await response.json();
	console.log('[Marking] Response received:', JSON.stringify(data).slice(0, 500));

	const text = data.choices?.[0]?.message?.content || '';
	if (!text) {
		console.error('[Marking] Empty response from model. Full response:', JSON.stringify(data));
		throw new Error('No response from analysis model');
	}

	// Extract token usage
	const usage: TokenUsage = {
		promptTokens: data.usage?.prompt_tokens ?? 0,
		candidatesTokens: data.usage?.completion_tokens ?? 0,
		totalTokens: data.usage?.total_tokens ?? 0
	};

	// Extract JSON from response
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error('Failed to parse AI response');
	}

	const result = JSON.parse(jsonMatch[0]);

	return {
		score: Math.min(Math.max(0, result.score || 0), maxPoints),
		feedback: result.feedback || 'No feedback available.',
		mistakes: result.mistakes || [],
		instructions: result.markingInstructions || null,
		usage
	};
}

/**
 * STEP 2: Mark the image using Kie.ai Nano Banana Edit (async task API)
 * Creates a task and polls for the result.
 */
async function markImage(
	imageUrl: string,
	instructions: string
): Promise<string | null> {
	const markingPrompt = `Mark this exam paper as a teacher would. ${instructions}

CRITICAL COLOR REQUIREMENT: Use ONLY RED color (#FF0000) for ALL annotations - ticks, crosses, circles, underlines, scores, comments, checkmarks, corrections. NEVER use green, blue, or any other color. Every single mark must be RED.

Keep original content intact, only add red annotations.`;

	console.log('[Marking] Creating Nano Banana Edit task...');

	// Create the marking task
	const createResponse = await fetch(KIE_TASK_URL, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${KIE_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: 'google/nano-banana-edit',
			input: {
				prompt: markingPrompt,
				image_urls: [imageUrl],
				output_format: 'png'
			}
		})
	});

	if (!createResponse.ok) {
		const errBody = await createResponse.text();
		console.error('[Marking] Nano Banana task creation failed:', errBody);
		throw new Error(`Failed to create marking task: ${errBody}`);
	}

	const createData = await createResponse.json();
	if (createData.code !== 200 || !createData.data?.taskId) {
		throw new Error(`Task creation failed: ${createData.msg || 'Unknown error'}`);
	}

	const taskId = createData.data.taskId;
	console.log(`[Marking] Task created: ${taskId}`);

	// Poll for result (max 120 seconds, check every 3 seconds)
	const maxAttempts = 40;
	const pollInterval = 3000;

	for (let i = 0; i < maxAttempts; i++) {
		await new Promise(resolve => setTimeout(resolve, pollInterval));

		const statusResponse = await fetch(`${KIE_RESULT_URL}?taskId=${taskId}`, {
			headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
		});

		if (!statusResponse.ok) continue;

		const statusData = await statusResponse.json();
		const state = statusData.data?.state;

		if (state === 'success') {
			// Parse resultJson to get image URLs
			const resultJson = JSON.parse(statusData.data.resultJson || '{}');
			const resultUrls = resultJson.resultUrls || [];

			if (resultUrls.length > 0) {
				console.log(`[Marking] Nano Banana task complete, image URL received`);
				return resultUrls[0];
			}
			console.warn('[Marking] Task succeeded but no image URL in result');
			return null;
		}

		if (state === 'failed' || state === 'error') {
			const failMsg = statusData.data?.failMsg || 'Unknown error';
			throw new Error(`Marking task failed: ${failMsg}`);
		}

		// Still processing, continue polling
	}

	throw new Error('Marking task timed out after 120 seconds');
}

/**
 * Background image marking - runs async without blocking response
 * Uses Nano Banana Edit via Kie.ai
 */
function markImageInBackground(submissionId: string, instructions: string) {
	const MAX_RETRIES = 2;
	const RETRY_DELAY = 3000;

	(async () => {
		let lastError: Error | null = null;

		// Get the original image URL from the submission
		const { data: submission } = await supabaseAdmin
			.from('submissions')
			.select('original_image_url')
			.eq('id', submissionId)
			.single();

		if (!submission?.original_image_url) {
			console.error(`[Marking] No original_image_url found for submission ${submissionId}`);
			return;
		}

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				console.log(`[Marking] Starting background image marking for ${submissionId} (attempt ${attempt}/${MAX_RETRIES})`);

				const markedImageUrl = await withTimeout(
					markImage(submission.original_image_url, instructions),
					150000, // 150 seconds (task creation + polling)
					'Image marking'
				);

				if (markedImageUrl) {
					// Download the marked image from Kie.ai (URLs expire in 24h)
					const imageResponse = await fetch(markedImageUrl);
					if (!imageResponse.ok) {
						throw new Error(`Failed to download marked image: ${imageResponse.status}`);
					}

					const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
					const markedFileName = `marked/${submissionId}_marked.png`;

					const { error: uploadError } = await supabaseAdmin.storage
						.from('submissions')
						.upload(markedFileName, imageBuffer, {
							contentType: 'image/png',
							upsert: true
						});

					if (uploadError) {
						throw new Error(`Storage upload failed: ${uploadError.message}`);
					}

					const { data: urlData } = supabaseAdmin.storage
						.from('submissions')
						.getPublicUrl(markedFileName);

					const { error: updateError } = await supabaseAdmin
						.from('submissions')
						.update({ marked_image_url: urlData.publicUrl })
						.eq('id', submissionId);

					if (updateError) {
						console.error(`[Marking] Failed to update marked_image_url for ${submissionId}:`, updateError);
					}

					console.log(`[Marking] Background marking complete for ${submissionId}`);
					return;
				} else {
					console.warn(`[Marking] No marked image returned for ${submissionId}`);
					return;
				}
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				console.error(`[Marking] Background marking attempt ${attempt} failed for ${submissionId}:`, lastError.message);

				if (attempt < MAX_RETRIES) {
					console.log(`[Marking] Retrying in ${RETRY_DELAY}ms...`);
					await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
				}
			}
		}

		console.error(`[Marking] Background marking failed after ${MAX_RETRIES} attempts for ${submissionId}:`, lastError?.message);
	})();
}
