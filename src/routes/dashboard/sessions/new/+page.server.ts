import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Get question ID from URL if pre-selected
	const preselectedQuestionId = url.searchParams.get('question');

	const { data: questions, error: err } = await locals.supabase
		.from('questions')
		.select('id, title, description, model_answer, max_points, time_limit_seconds')
		.eq('teacher_id', locals.user.id)
		.order('created_at', { ascending: false });

	if (err) {
		console.error('Failed to load questions:', err);
		throw error(500, 'Failed to load questions');
	}

	return {
		questions: questions ?? [],
		preselectedQuestionId
	};
};
