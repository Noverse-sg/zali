import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { data: questions, error: err } = await locals.supabase
		.from('questions')
		.select('*')
		.eq('teacher_id', locals.user.id)
		.order('created_at', { ascending: false });

	if (err) {
		console.error('Failed to load questions:', err);
		throw error(500, 'Failed to load questions');
	}

	return {
		questions: questions ?? []
	};
};
