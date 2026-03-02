import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { NOVERSE_API_KEY, NOVERSE_API_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

// Allow up to 10MB request bodies (student images can be large)
export const config = {
	body: {
		maxSize: '10mb'
	}
};

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const NOVERSE_HEADERS = {
	'Content-Type': 'application/json',
	'Authorization': `Bearer ${NOVERSE_API_KEY}`
};

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

/**
 * Poll Noverse API for job completion
 */
async function pollJobResult(jobId: string, maxWaitMs = 120000): Promise<Record<string, unknown>> {
	const pollInterval = 3000;
	const maxAttempts = Math.ceil(maxWaitMs / pollInterval);

	for (let i = 0; i < maxAttempts; i++) {
		await new Promise(resolve => setTimeout(resolve, pollInterval));

		const res = await fetch(`${NOVERSE_API_URL}/jobs/${jobId}`, {
			headers: NOVERSE_HEADERS
		});

		if (!res.ok) {
			console.error(`[Marking] Poll error: ${res.status}`);
			continue;
		}

		const job = await res.json();

		if (job.status === 'completed') {
			return job;
		}

		if (job.status === 'failed') {
			throw new Error(job.error || 'Marking job failed');
		}

		// Still pending/processing, keep polling
	}

	throw new Error('Marking job timed out');
}

export const POST: RequestHandler = async ({ request }) => {
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

		// Get the original image URL from the submission (Noverse API needs a URL, not base64)
		const { data: submission } = await supabaseAdmin
			.from('submissions')
			.select('original_image_url')
			.eq('id', submissionId)
			.single();

		if (!submission?.original_image_url) {
			throw new Error('No original_image_url found for submission');
		}

		// Build Noverse job request
		const jobBody: Record<string, unknown> = {
			mode: 'advanced',
			pdf_url: submission.original_image_url,
		};

		// Add context (model answer as instructions, answer key as URL)
		const context: Record<string, string> = {};
		if (modelAnswer) {
			context.instructions = `MODEL ANSWER / RUBRIC:\n${modelAnswer}\n\nMAXIMUM POINTS: ${maxPoints ?? 10}\n\nMark this student's answer against the model answer above.`;
		}
		if (answerKeyUrl) {
			context.answer_key_url = answerKeyUrl;
		}
		if (Object.keys(context).length > 0) {
			jobBody.context = context;
		}

		console.log('[Marking] Submitting job to Noverse API...');

		// Submit job to Noverse API
		const submitRes = await withTimeout(
			fetch(`${NOVERSE_API_URL}/jobs`, {
				method: 'POST',
				headers: NOVERSE_HEADERS,
				body: JSON.stringify(jobBody)
			}),
			15000,
			'Job submission'
		);

		if (!submitRes.ok) {
			const err = await submitRes.json().catch(() => ({}));
			console.error('[Marking] Noverse job submission error:', err);
			throw new Error(err.error || `Noverse API returned ${submitRes.status}`);
		}

		const { job_id } = await submitRes.json();
		console.log(`[Marking] Job submitted: ${job_id}, polling for result...`);

		// Poll for result
		const result = await withTimeout(
			pollJobResult(job_id),
			120000,
			'Job polling'
		);

		console.log(`[Marking] Job completed: ${job_id}`);

		// Extract results from Noverse response
		const results = result.results as Record<string, unknown> | undefined;
		const analysis = results?.analysis as Record<string, unknown> | undefined;
		const pages = (results?.pages || []) as Array<{ page: number; imageBase64?: string; mimeType?: string }>;

		const score = (analysis?.total_score as number) ?? 0;
		const maxScore = (analysis?.max_score as number) ?? maxPoints ?? 10;
		const feedback = (analysis?.summary as string) ?? 'No feedback available.';
		const pageResults = (analysis?.pages || []) as Array<{ feedback?: string }>;
		const mistakes = pageResults
			.filter((p) => p.feedback)
			.map((p) => p.feedback as string);

		// Upload marked images to Supabase storage
		let markedImageUrl: string | null = null;
		if (pages.length > 0 && pages[0].imageBase64) {
			try {
				const markedFileName = `marked/${submissionId}_marked.png`;
				const imageBuffer = Buffer.from(pages[0].imageBase64, 'base64');

				await supabaseAdmin.storage
					.from('submissions')
					.upload(markedFileName, imageBuffer, {
						contentType: pages[0].mimeType || 'image/png',
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
		const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * (maxPoints ?? 10)) : score;

		const { error: resultError } = await supabaseAdmin
			.from('submissions')
			.update({
				score: normalizedScore,
				feedback,
				mistakes,
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
			score: normalizedScore,
			feedback,
			mistakes,
			markedImageUrl
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[Marking] Error:', errorMessage);

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
