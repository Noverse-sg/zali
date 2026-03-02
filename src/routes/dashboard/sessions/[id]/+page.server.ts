import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { id: sessionId } = params;

	// Load session with question
	const { data: session, error: sessionError } = await locals.supabase
		.from('sessions')
		.select('*, questions(*)')
		.eq('id', sessionId)
		.eq('teacher_id', locals.user.id)
		.single();

	if (sessionError || !session) {
		console.error('Failed to load session:', sessionError);
		throw error(404, 'Session not found');
	}

	// Load submissions for this session
	const { data: submissions, error: submissionsError } = await locals.supabase
		.from('submissions')
		.select('*')
		.eq('session_id', sessionId)
		.order('submitted_at', { ascending: false });

	if (submissionsError) {
		console.error('Failed to load submissions:', submissionsError);
	}

	return {
		session,
		submissions: submissions ?? []
	};
};
