import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Use Gemini 3 models for analysis and image marking
const ANALYSIS_MODEL = 'gemini-3-flash-preview';
const IMAGE_EDIT_MODEL = 'gemini-3-pro-image-preview';

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

	try {
		const body = await request.json();
		submissionId = body.submissionId;
		imageBase64 = body.imageBase64;
		modelAnswer = body.modelAnswer;
		maxPoints = body.maxPoints;
		contextFiles = body.contextFiles || [];
	} catch (err) {
		console.error('[Marking] Failed to parse request body:', err);
		return json({ success: false, error: 'Invalid request body' }, { status: 400 });
	}

	if (!submissionId || !imageBase64 || !modelAnswer) {
		return json({ success: false, error: 'Missing required fields' }, { status: 400 });
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

		// Step 1: Analyze the student's answer and generate marking instructions
		// Timeout after 60 seconds
		const analysisResult = await withTimeout(
			analyzeStudentAnswer(imageBase64, modelAnswer, maxPoints ?? 10, contextFiles),
			60000,
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

		// Step 2: Generate marked image in background (don't block response)
		if (analysisResult.instructions) {
			markImageInBackground(submissionId, imageBase64, analysisResult.instructions);
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
 * STEP 1: Analyze student answer and generate marking instructions
 * Sends student image + context files to Gemini for analysis
 */
async function analyzeStudentAnswer(
	imageBase64: string,
	modelAnswer: string,
	maxPoints: number,
	contextFiles: ContextFile[]
): Promise<{ score: number; feedback: string; mistakes: string[]; instructions: string | null; usage: TokenUsage }> {
	const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

	// Build concise prompt
	let promptText = `You are marking a student's handwritten exam answer (image attached).

MODEL ANSWER: ${modelAnswer}
MAX POINTS: ${maxPoints}

Analyze the student's answer in the image and return ONLY this JSON:
{"score": <number 0-${maxPoints}>, "feedback": "<1-2 sentences>", "mistakes": ["<mistake1>", "<mistake2>"], "markingInstructions": "<brief instructions for red annotations on the image>"}`;

	contents.push({ text: promptText });

	// Add context files
	for (const ctx of contextFiles) {
		if (ctx.mimeType === 'application/pdf') {
			contents.push({
				inlineData: {
					mimeType: 'application/pdf',
					data: ctx.data
				}
			});
		} else if (ctx.mimeType.startsWith('image/')) {
			contents.push({
				inlineData: {
					mimeType: ctx.mimeType,
					data: ctx.data
				}
			});
		} else if (ctx.mimeType.startsWith('text/') || ctx.mimeType === 'application/json') {
			const text = Buffer.from(ctx.data, 'base64').toString('utf-8');
			contents.push({ text: `\n=== ${ctx.name} ===\n${text}` });
		}
	}

	// Add student image
	contents.push({
		inlineData: {
			mimeType: 'image/png',
			data: imageBase64
		}
	});

	console.log(`[Marking] Calling ${ANALYSIS_MODEL} for analysis...`);

	let response;
	try {
		response = await genAI.models.generateContent({
			model: ANALYSIS_MODEL,
			contents: contents
		});
	} catch (apiError) {
		console.error('[Marking] Gemini API error:', apiError);
		throw new Error(`Gemini API call failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
	}

	console.log('[Marking] Response received:', JSON.stringify(response).slice(0, 500));

	const text = response.text || '';
	if (!text) {
		console.error('[Marking] Empty response from model. Full response:', JSON.stringify(response));
		throw new Error('No response from analysis model');
	}

	// Extract token usage from response
	const usageMetadata = response.usageMetadata;
	const usage: TokenUsage = {
		promptTokens: usageMetadata?.promptTokenCount ?? 0,
		candidatesTokens: usageMetadata?.candidatesTokenCount ?? 0,
		totalTokens: usageMetadata?.totalTokenCount ?? 0
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
 * STEP 2: Mark the image using Gemini image edit
 */
async function markImage(
	imageBase64: string,
	instructions: string
): Promise<{ markedImageBase64: string | null; usage: TokenUsage }> {
	const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

	parts.push({
		inlineData: {
			mimeType: 'image/png',
			data: imageBase64
		}
	});

	const markingPrompt = `Add RED teacher marks to this exam paper. ${instructions}. Keep original content, only add red annotations.`;

	parts.push({ text: markingPrompt });

	console.log(`[Marking] Calling ${IMAGE_EDIT_MODEL} for image marking...`);
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_EDIT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts }],
				generationConfig: {
					temperature: 0.1,
					responseModalities: ['IMAGE', 'TEXT']
				}
			})
		}
	);

	if (!response.ok) {
		const err = await response.json();
		console.error('[Marking] Gemini marking error:', err);
		throw new Error(err.error?.message || 'Failed to mark image');
	}

	const data = await response.json();
	const candidate = data.candidates?.[0];

	if (!candidate?.content?.parts) {
		throw new Error('No response from Gemini for marking');
	}

	// Extract token usage from response
	const usageMetadata = data.usageMetadata;
	const usage: TokenUsage = {
		promptTokens: usageMetadata?.promptTokenCount ?? 0,
		candidatesTokens: usageMetadata?.candidatesTokenCount ?? 0,
		totalTokens: usageMetadata?.totalTokenCount ?? 0
	};

	for (const part of candidate.content.parts) {
		if (part.inlineData?.mimeType?.startsWith('image/')) {
			return {
				markedImageBase64: part.inlineData.data,
				usage
			};
		}
	}

	console.warn('[Marking] No marked image returned');
	return {
		markedImageBase64: null,
		usage
	};
}

/**
 * Background image marking - runs async without blocking response
 * Includes retry logic for transient failures
 */
function markImageInBackground(submissionId: string, imageBase64: string, instructions: string) {
	const MAX_RETRIES = 2;
	const RETRY_DELAY = 3000; // 3 seconds

	// Run without awaiting - fire and forget
	(async () => {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				console.log(`[Marking] Starting background image marking for ${submissionId} (attempt ${attempt}/${MAX_RETRIES})`);

				// Add timeout for the marking operation (90 seconds)
				const markResult = await withTimeout(
					markImage(imageBase64, instructions),
					90000,
					'Image marking'
				);

				if (markResult.markedImageBase64) {
					const markedFileName = `marked/${submissionId}_marked.png`;
					const imageBuffer = Buffer.from(markResult.markedImageBase64, 'base64');

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
					console.log(`[Marking] Image marking tokens - prompt: ${markResult.usage.promptTokens}, output: ${markResult.usage.candidatesTokens}`);
					return; // Success - exit the retry loop
				} else {
					console.warn(`[Marking] No marked image returned for ${submissionId}`);
					return; // No image but no error - don't retry
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

		// All retries exhausted
		console.error(`[Marking] Background marking failed after ${MAX_RETRIES} attempts for ${submissionId}:`, lastError?.message);
	})();
}
