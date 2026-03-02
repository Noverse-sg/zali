import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

interface SessionWithQuestion {
	id: string;
	code: string;
	created_at: string;
	questions: { title: string; max_points: number } | null;
}

interface SubmissionData {
	session_id: string;
	score: number | null;
	max_score: number;
	mistakes: string[] | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Get all sessions with their questions
	const { data: sessionsData, error: sessionsError } = await locals.supabase
		.from('sessions')
		.select('id, code, created_at, questions(title, max_points)')
		.eq('teacher_id', locals.user.id)
		.order('created_at', { ascending: false });

	if (sessionsError) {
		console.error('Failed to load sessions:', sessionsError);
		throw error(500, 'Failed to load analytics');
	}

	const sessions = (sessionsData ?? []) as SessionWithQuestion[];

	if (sessions.length === 0) {
		return { analyticsData: [] };
	}

	// Get all session IDs
	const sessionIds = sessions.map((s) => s.id);

	// Fetch ALL submissions for ALL sessions in ONE query
	const { data: submissionsData, error: submissionsError } = await locals.supabase
		.from('submissions')
		.select('session_id, score, max_score, mistakes')
		.in('session_id', sessionIds)
		.eq('status', 'completed');

	if (submissionsError) {
		console.error('Failed to load submissions:', submissionsError);
	}

	const allSubmissions = (submissionsData ?? []) as SubmissionData[];

	// Group submissions by session_id in memory
	const submissionsBySession: Record<string, SubmissionData[]> = {};
	for (const submission of allSubmissions) {
		if (!submissionsBySession[submission.session_id]) {
			submissionsBySession[submission.session_id] = [];
		}
		submissionsBySession[submission.session_id]!.push(submission);
	}

	// Process sessions with their submissions
	const analyticsData = sessions.map((session) => {
		const sessionSubmissions = submissionsBySession[session.id] || [];
		const totalSubmissions = sessionSubmissions.length;

		// Calculate average score
		const avgScore =
			totalSubmissions > 0
				? Math.round(
						sessionSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / totalSubmissions
					)
				: 0;

		// Aggregate mistakes
		const mistakeCounts: Record<string, number> = {};
		for (const submission of sessionSubmissions) {
			if (submission.mistakes) {
				for (const mistake of submission.mistakes) {
					mistakeCounts[mistake] = (mistakeCounts[mistake] || 0) + 1;
				}
			}
		}

		const commonMistakes = Object.entries(mistakeCounts)
			.map(([mistake, count]) => ({ mistake, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			id: session.id,
			code: session.code,
			questionTitle: session.questions?.title || 'Unknown',
			createdAt: session.created_at,
			totalSubmissions,
			avgScore,
			maxScore: session.questions?.max_points || 10,
			commonMistakes
		};
	});

	return { analyticsData };
};
