import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { NOVERSE_API_KEY, NOVERSE_API_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ContextFile {
	name: string;
	mimeType: string;
	data: string; // base64
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

		// Call Noverse API for marking (timeout after 120 seconds)
		const noverseResponse = await withTimeout(
			fetch(`${NOVERSE_API_URL}/api/mark-image`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${NOVERSE_API_KEY}`
				},
				body: JSON.stringify({
					imageBase64,
					modelAnswer: modelAnswer || '',
					maxPoints: maxPoints ?? 10,
					contextFiles
				})
			}),
			120000,
			'Noverse API'
		);

		if (!noverseResponse.ok) {
			const err = await noverseResponse.json().catch(() => ({}));
			console.error('[Marking] Noverse API error:', err);
			throw new Error(err.error || 'Noverse API request failed');
		}

		const result = await noverseResponse.json();

		console.log(`[Marking] Analysis tokens - prompt: ${result.usage?.analysis?.promptTokens ?? 0}, output: ${result.usage?.analysis?.candidatesTokens ?? 0}`);
		console.log(`[Marking] Image marking tokens - prompt: ${result.usage?.imageMarking?.promptTokens ?? 0}, output: ${result.usage?.imageMarking?.candidatesTokens ?? 0}`);

		// Upload marked image to Supabase storage if returned
		let markedImageUrl: string | null = null;
		if (result.markedImageBase64) {
			try {
				const markedFileName = `marked/${submissionId}_marked.png`;
				const imageBuffer = Buffer.from(result.markedImageBase64, 'base64');

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
			} catch (uploadError) {
				console.error('[Marking] Image upload failed:', uploadError);
			}
		}

		// Update submission with results
		const { error: resultError } = await supabaseAdmin
			.from('submissions')
			.update({
				score: result.score,
				feedback: result.feedback,
				mistakes: result.mistakes,
				marked_image_url: markedImageUrl,
				status: 'completed',
				marked_at: new Date().toISOString()
			})
			.eq('id', submissionId);

		if (resultError) {
			console.error('[Marking] Failed to update submission with results:', resultError);
		}

		return json({
			success: true,
			score: result.score,
			feedback: result.feedback,
			mistakes: result.mistakes,
			markedImageUrl
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
