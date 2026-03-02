import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database, Session, Question } from '$lib/types/database';

type SessionWithQuestion = Session & { questions: Question };

export const load: PageServerLoad = async ({ params }) => {
	const { code } = params;

	// Use anon client for public access (students don't need to be logged in)
	const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const { data: sessionData, error: err } = await supabase
		.from('sessions')
		.select('*, questions(*)')
		.eq('code', code.toUpperCase())
		.single();

	if (err || !sessionData) {
		console.error('Failed to load session:', err);
		throw error(404, 'Session not found. Please check the code.');
	}

	const session = sessionData as unknown as SessionWithQuestion;

	// Check session status
	if (session.status === 'closed') {
		return {
			session,
			error: 'This session has ended.'
		};
	}

	if (session.status === 'waiting') {
		return {
			session,
			error: 'This session has not started yet. Please wait.'
		};
	}

	return {
		session,
		error: null
	};
};
