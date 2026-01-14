import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const ANALYSIS_MODEL = 'gemini-2.0-flash';
const IMAGE_EDIT_MODEL = 'gemini-2.0-flash-exp-image-generation';

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

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { submissionId, imageBase64, modelAnswer, maxPoints, contextFiles = [] } = await request.json();

		if (!submissionId || !imageBase64 || !modelAnswer) {
			return json({ success: false, error: 'Missing required fields' }, { status: 400 });
		}

		// Update submission status to marking
		await supabaseAdmin
			.from('submissions')
			.update({ status: 'marking' })
			.eq('id', submissionId);

		// Step 1: Analyze the student's answer and generate marking instructions
		const analysisResult = await analyzeStudentAnswer(imageBase64, modelAnswer, maxPoints, contextFiles);

		console.log(`[Marking] Analysis tokens - prompt: ${analysisResult.usage.promptTokens}, output: ${analysisResult.usage.candidatesTokens}, total: ${analysisResult.usage.totalTokens}`);

		// Step 2: Generate marked image with annotations
		let markedImageUrl: string | null = null;
		if (analysisResult.instructions) {
			try {
				const markResult = await markImage(imageBase64, analysisResult.instructions);
				console.log(`[Marking] Image marking tokens - prompt: ${markResult.usage.promptTokens}, output: ${markResult.usage.candidatesTokens}, total: ${markResult.usage.totalTokens}`);

				if (markResult.markedImageBase64) {
					// Upload marked image to Supabase storage
					const markedFileName = `marked/${submissionId}_marked.png`;
					const imageBuffer = Buffer.from(markResult.markedImageBase64, 'base64');

					await supabaseAdmin.storage
						.from('submissions')
						.upload(markedFileName, imageBuffer, {
							contentType: 'image/png',
							upsert: true
						});

					const { data: urlData } = supabaseAdmin.storage
						.from('submissions')
						.getPublicUrl(markedFileName);

					markedImageUrl = urlData.publicUrl;
				}
			} catch (markError) {
				console.error('[Marking] Image marking failed:', markError);
				// Continue without marked image
			}
		}

		// Update submission with results
		await supabaseAdmin
			.from('submissions')
			.update({
				score: analysisResult.score,
				feedback: analysisResult.feedback,
				mistakes: analysisResult.mistakes,
				marked_image_url: markedImageUrl,
				status: 'completed',
				marked_at: new Date().toISOString()
			})
			.eq('id', submissionId);

		return json({
			success: true,
			score: analysisResult.score,
			feedback: analysisResult.feedback,
			mistakes: analysisResult.mistakes,
			markedImageUrl
		});
	} catch (error) {
		console.error('[Marking] Error:', error);

		// Update submission status to error
		const { submissionId } = await request.json().catch(() => ({}));
		if (submissionId) {
			await supabaseAdmin
				.from('submissions')
				.update({ status: 'error' })
				.eq('id', submissionId);
		}

		return json(
			{ success: false, error: 'Marking failed. Please try again.' },
			{ status: 500 }
		);
	}
};

/**
 * STEP 1: Analyze student answer and generate marking instructions
 * Sends student image + context files to Gemini 3 Pro
 */
async function analyzeStudentAnswer(
	imageBase64: string,
	modelAnswer: string,
	maxPoints: number,
	contextFiles: ContextFile[]
): Promise<{ score: number; feedback: string; mistakes: string[]; instructions: string | null; usage: TokenUsage }> {
	const contents: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

	// Build the prompt
	let promptText = `You are an expert exam marker. Analyze the student's exam paper and provide marking instructions.

`;

	// Add model answer/rubric
	promptText += `MODEL ANSWER / RUBRIC:
${modelAnswer}

MAXIMUM POINTS: ${maxPoints}

---

`;

	// Add context files info
	if (contextFiles.length > 0) {
		promptText += `REFERENCE MATERIALS (rubric, answer key, marking guide) are attached below.

---

`;
	}

	promptText += `STUDENT ANSWER is attached below.

YOUR TASK:
1. Read and understand the student's handwritten answer
2. Compare it to the model answer/rubric and any reference materials
3. Identify any mistakes or areas for improvement
4. Assign a score out of ${maxPoints}
5. Provide brief, constructive feedback
6. Generate marking instructions for annotating the image

MARKING STYLE - Make it look like natural teacher marking:
- DO NOT put a tick on every single line - that looks robotic
- Use VARIED annotation types: circles, underlines, brackets, margin notes
- Put ONE tick or checkmark for a correct SECTION or PARAGRAPH, not every line
- Circle or underline KEY TERMS that are correct or incorrect
- Use margin comments for feedback (e.g., "Good point!", "Needs more detail")
- Cross out or strike through incorrect parts
- Write corrections next to errors
- Put the SCORE in the margin

RESPONSE FORMAT (JSON):
{
  "score": <number 0-${maxPoints}>,
  "feedback": "<brief 1-2 sentence feedback>",
  "mistakes": ["<mistake 1>", "<mistake 2>", ...],
  "markingInstructions": "<detailed instructions for marking the image with red annotations, OR null if no marking needed>"
}

Return ONLY valid JSON, no other text.`;

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

	console.log('[Marking] Calling Gemini 3 Pro for analysis...');
	const response = await genAI.models.generateContent({
		model: ANALYSIS_MODEL,
		contents: contents,
		config: {
			temperature: 0,
			maxOutputTokens: 4096
		}
	});

	const text = response.text || '';
	if (!text) throw new Error('No response from analysis model');

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

	const markingPrompt = `Mark this student's exam paper with RED annotations like a real teacher would. Follow these instructions:

${instructions}

STYLE RULES - Make it look like natural hand-marking:
1. PRESERVE all original student work - do NOT erase or cover anything
2. Only ADD red marks on top of the existing content
3. Use clear, readable RED ink for all annotations
4. VARY your mark types - use circles, underlines, brackets, margin notes, not just ticks
5. DO NOT tick every single line - one tick per correct section/answer is enough
6. Circle or underline important terms (correct or incorrect)
7. Use brackets [ ] to group related content
8. Write SHORT margin comments (e.g., "Good!", "?", "See notes")
9. Strikethrough wrong answers with a single line
10. Write scores clearly in the margin

Return the marked image.`;

	parts.push({ text: markingPrompt });

	console.log('[Marking] Calling Gemini 3 Pro Image for marking...');
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
