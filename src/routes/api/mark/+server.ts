import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { NOVERSE_API_KEY, NOVERSE_API_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

		// Call Noverse API for marking
		const noverseResponse = await fetch(`${NOVERSE_API_URL}/api/mark-image`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${NOVERSE_API_KEY}`
			},
			body: JSON.stringify({
				imageBase64,
				modelAnswer,
				maxPoints,
				contextFiles
			})
		});

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
		await supabaseAdmin
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

		return json({
			success: true,
			score: result.score,
			feedback: result.feedback,
			mistakes: result.mistakes,
			markedImageUrl
		});
	} catch (error) {
		console.error('[Marking] Error:', error);

		// Try to update submission status to error
		try {
			const body = await request.clone().json().catch(() => ({}));
			if (body.submissionId) {
				await supabaseAdmin
					.from('submissions')
					.update({ status: 'error' })
					.eq('id', body.submissionId);
			}
		} catch {
			// ignore
		}

		return json(
			{ success: false, error: 'Marking failed. Please try again.' },
			{ status: 500 }
		);
	}
};
