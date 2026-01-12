<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import type { Session, Question, Submission } from '$lib/types/database';
	import QRCode from 'qrcode';
	import { PUBLIC_APP_URL } from '$env/static/public';

	type SessionWithQuestion = Session & { questions: Question };

	let session = $state<SessionWithQuestion | null>(null);
	let submissions = $state<Submission[]>([]);
	let qrCodeUrl = $state('');
	let loading = $state(true);
	let subscription: ReturnType<typeof supabase.channel> | null = null;

	const sessionId = $page.params.id;
	const joinUrl = $derived(`${PUBLIC_APP_URL}/join/${session?.code}`);

	onMount(async () => {
		await loadSession();
		await loadSubmissions();
		setupRealtimeSubscription();
		loading = false;
	});

	onDestroy(() => {
		subscription?.unsubscribe();
	});

	async function loadSession() {
		const { data } = await supabase
			.from('sessions')
			.select('*, questions(*)')
			.eq('id', sessionId)
			.single();

		session = data as SessionWithQuestion;

		if (session) {
			qrCodeUrl = await QRCode.toDataURL(joinUrl, {
				width: 300,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			});
		}
	}

	async function loadSubmissions() {
		const { data } = await supabase
			.from('submissions')
			.select('*')
			.eq('session_id', sessionId)
			.order('submitted_at', { ascending: false });

		submissions = data || [];
	}

	function setupRealtimeSubscription() {
		subscription = supabase
			.channel(`session-${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'submissions',
					filter: `session_id=eq.${sessionId}`
				},
				(payload) => {
					if (payload.eventType === 'INSERT') {
						submissions = [payload.new as Submission, ...submissions];
					} else if (payload.eventType === 'UPDATE') {
						submissions = submissions.map(s =>
							s.id === payload.new.id ? payload.new as Submission : s
						);
					}
				}
			)
			.subscribe();
	}

	async function startSession() {
		if (!session) return;
		await supabase
			.from('sessions')
			.update({ status: 'active', started_at: new Date().toISOString() })
			.eq('id', sessionId);
		await loadSession();
	}

	async function closeSession() {
		if (!session) return;
		await supabase
			.from('sessions')
			.update({ status: 'closed', closed_at: new Date().toISOString() })
			.eq('id', sessionId);
		await loadSession();
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed': return 'badge-success';
			case 'marking': return 'badge-warning';
			case 'pending': return 'badge-info';
			case 'error': return 'badge-error';
			default: return 'badge-info';
		}
	}

	const stats = $derived({
		total: submissions.length,
		pending: submissions.filter(s => s.status === 'pending').length,
		marking: submissions.filter(s => s.status === 'marking').length,
		completed: submissions.filter(s => s.status === 'completed').length,
		avgScore: submissions.filter(s => s.score !== null).length > 0
			? Math.round(
				submissions.filter(s => s.score !== null)
					.reduce((sum, s) => sum + (s.score || 0), 0) /
				submissions.filter(s => s.score !== null).length
			)
			: null
	});
</script>

<div class="page">
	{#if loading}
		<div class="loading">Loading session...</div>
	{:else if !session}
		<div class="error card">
			<h3>Session not found</h3>
			<a href="/dashboard/sessions" class="btn-primary">Back to Sessions</a>
		</div>
	{:else}
		<header class="page-header">
			<a href="/dashboard/sessions" class="back-link">Back to Sessions</a>
			<div class="header-content">
				<div>
					<h1>{session.questions.title}</h1>
					<p>Join Code: <strong>{session.code}</strong></p>
				</div>
				<div class="session-controls">
					{#if session.status === 'waiting'}
						<button class="btn-primary" onclick={startSession}>
							Start Session
						</button>
					{:else if session.status === 'active'}
						<button class="btn-danger" onclick={closeSession}>
							Close Session
						</button>
					{/if}
					<span class="badge {session.status === 'active' ? 'badge-success' : session.status === 'waiting' ? 'badge-warning' : 'badge-error'}">
						{session.status}
					</span>
				</div>
			</div>
		</header>

		<div class="session-grid">
			<div class="card qr-section">
				<h2>QR Code</h2>
				<p class="join-url">{joinUrl}</p>
				{#if qrCodeUrl}
					<img src={qrCodeUrl} alt="QR Code to join session" class="qr-code" />
				{/if}
				<p class="instruction">Students scan to join</p>
			</div>

			<div class="card stats-section">
				<h2>Statistics</h2>
				<div class="stats-grid">
					<div class="stat">
						<span class="stat-value">{stats.total}</span>
						<span class="stat-label">Total</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.pending}</span>
						<span class="stat-label">Pending</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.marking}</span>
						<span class="stat-label">Marking</span>
					</div>
					<div class="stat">
						<span class="stat-value">{stats.completed}</span>
						<span class="stat-label">Completed</span>
					</div>
				</div>
				{#if stats.avgScore !== null}
					<div class="avg-score">
						Average Score: <strong>{stats.avgScore} / {session.questions.max_points}</strong>
					</div>
				{/if}
			</div>
		</div>

		<div class="card submissions-section">
			<h2>Submissions ({submissions.length})</h2>
			{#if submissions.length === 0}
				<p class="no-submissions">No submissions yet. Waiting for students...</p>
			{:else}
				<div class="submissions-list">
					{#each submissions as submission}
						<div class="submission-item">
							<div class="submission-info">
								<strong>{submission.student_name}</strong>
								<span class="badge {getStatusColor(submission.status)}">{submission.status}</span>
							</div>
							{#if submission.status === 'completed'}
								<div class="submission-score">
									{submission.score} / {submission.max_score}
								</div>
							{/if}
							<div class="submission-images">
								<a href={submission.original_image_url} target="_blank" class="image-link">
									Original
								</a>
								{#if submission.marked_image_url}
									<a href={submission.marked_image_url} target="_blank" class="image-link">
										Marked
									</a>
								{/if}
							</div>
							{#if submission.feedback}
								<p class="submission-feedback">{submission.feedback}</p>
							{/if}
							{#if submission.mistakes && submission.mistakes.length > 0}
								<div class="submission-mistakes">
									<strong>Mistakes:</strong>
									<ul>
										{#each submission.mistakes as mistake}
											<li>{mistake}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page-header {
		margin-bottom: 2rem;
	}

	.back-link {
		display: inline-block;
		color: var(--gray-500);
		text-decoration: none;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.back-link:hover {
		color: var(--primary);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.page-header h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}

	.page-header p {
		color: var(--gray-500);
		font-size: 0.875rem;
	}

	.page-header strong {
		font-family: monospace;
		font-size: 1rem;
		color: var(--gray-900);
	}

	.session-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.loading, .error {
		text-align: center;
		padding: 3rem;
	}

	.error a {
		text-decoration: none;
		display: inline-flex;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		background: var(--primary);
		color: white;
	}

	.session-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.qr-section, .stats-section {
		text-align: center;
	}

	.qr-section h2, .stats-section h2, .submissions-section h2 {
		font-size: 1rem;
		margin-bottom: 1rem;
		color: var(--gray-700);
	}

	.join-url {
		font-size: 0.75rem;
		color: var(--gray-500);
		word-break: break-all;
		margin-bottom: 1rem;
	}

	.qr-code {
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.instruction {
		font-size: 0.875rem;
		color: var(--gray-500);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		color: var(--gray-900);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--gray-500);
	}

	.avg-score {
		font-size: 0.875rem;
		color: var(--gray-600);
		padding-top: 1rem;
		border-top: 1px solid var(--gray-200);
	}

	.no-submissions {
		text-align: center;
		color: var(--gray-500);
		padding: 2rem;
	}

	.submissions-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.submission-item {
		padding: 1rem;
		background: var(--gray-50);
		border-radius: 0.5rem;
	}

	.submission-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.submission-score {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--primary);
		margin-bottom: 0.5rem;
	}

	.submission-images {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.image-link {
		font-size: 0.75rem;
		color: var(--primary);
	}

	.submission-feedback {
		font-size: 0.875rem;
		color: var(--gray-600);
		margin-bottom: 0.5rem;
	}

	.submission-mistakes {
		font-size: 0.875rem;
	}

	.submission-mistakes strong {
		color: var(--error);
	}

	.submission-mistakes ul {
		margin: 0.25rem 0 0 1rem;
		color: var(--gray-600);
	}

	@media (max-width: 768px) {
		.session-grid {
			grid-template-columns: 1fr;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
