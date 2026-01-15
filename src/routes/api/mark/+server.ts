import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const ANALYSIS_MODEL = 'gemini-3-pro-preview';
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

		// Update submission with analysis results immediately
		await supabaseAdmin
			.from('submissions')
			.update({
				score: analysisResult.score,
				feedback: analysisResult.feedback,
				mistakes: analysisResult.mistakes,
				status: 'completed',
				marked_at: new Date().toISOString()
			})
			.eq('id', submissionId);

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

	console.log('[Marking] Calling Gemini 3 Pro for analysis...');
	const response = await genAI.models.generateContent({
		model: ANALYSIS_MODEL,
		contents: contents,
		config: {
			temperature: 0,
			maxOutputTokens: 1024
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

	const markingPrompt = `Add RED teacher marks to this exam paper. ${instructions}. Keep original content, only add red annotations.`;

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

/**
 * Background image marking - runs async without blocking response
 */
function markImageInBackground(submissionId: string, imageBase64: string, instructions: string) {
	// Run without awaiting - fire and forget
	(async () => {
		try {
			console.log(`[Marking] Starting background image marking for ${submissionId}`);
			const markResult = await markImage(imageBase64, instructions);

			if (markResult.markedImageBase64) {
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

				await supabaseAdmin
					.from('submissions')
					.update({ marked_image_url: urlData.publicUrl })
					.eq('id', submissionId);

				console.log(`[Marking] Background marking complete for ${submissionId}`);
			}
		} catch (err) {
			console.error(`[Marking] Background marking failed for ${submissionId}:`, err);
		}
	})();
}
