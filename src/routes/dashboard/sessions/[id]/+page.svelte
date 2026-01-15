<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import type { Session, Question, Submission } from '$lib/types/database';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import QRCode from 'qrcode';
	import { PUBLIC_APP_URL } from '$env/static/public';

	type SessionWithQuestion = Session & { questions: Question };

	let session: SessionWithQuestion | null = null;
	let submissions: Submission[] = [];
	let qrCodeUrl = '';
	let loading = true;
	let loadError = '';
	let subscription: RealtimeChannel | null = null;
	let subscriptionStatus: 'connecting' | 'connected' | 'error' = 'connecting';
	let retryCount = 0;
	const MAX_RETRIES = 3;

	const sessionId = $page.params.id;
	$: joinUrl = `${PUBLIC_APP_URL}/join/${session?.code}`;

	onMount(async () => {
		await loadSession();
		if (session) {
			await loadSubmissions();
			setupRealtimeSubscription();
		}
		loading = false;
	});

	onDestroy(() => {
		if (subscription) {
			subscription.unsubscribe();
			subscription = null;
		}
	});

	async function loadSession() {
		try {
			const { data, error } = await supabase
				.from('sessions')
				.select('*, questions(*)')
				.eq('id', sessionId)
				.single();

			if (error) {
				console.error('Failed to load session:', error);
				loadError = 'Failed to load session. Please try again.';
				return;
			}

			session = data as SessionWithQuestion;

			if (session) {
				try {
					qrCodeUrl = await QRCode.toDataURL(joinUrl, {
						width: 300,
						margin: 2,
						color: { dark: '#000000', light: '#ffffff' }
					});
				} catch (err) {
					console.error('Failed to generate QR code:', err);
				}
			}
		} catch (err) {
			console.error('Error loading session:', err);
			loadError = 'Failed to load session. Please try again.';
		}
	}

	async function loadSubmissions() {
		try {
			const { data, error } = await supabase
				.from('submissions')
				.select('*')
				.eq('session_id', sessionId)
				.order('submitted_at', { ascending: false });

			if (error) {
				console.error('Failed to load submissions:', error);
				return;
			}

			submissions = data || [];
		} catch (err) {
			console.error('Error loading submissions:', err);
		}
	}

	function setupRealtimeSubscription() {
		if (subscription) {
			subscription.unsubscribe();
		}

		subscriptionStatus = 'connecting';

		subscription = supabase
			.channel(`session-${sessionId}-${Date.now()}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'submissions',
					filter: `session_id=eq.${sessionId}`
				},
				(payload) => {
					console.log('[Realtime] Received update:', payload.eventType);
					if (payload.eventType === 'INSERT') {
						submissions = [payload.new as Submission, ...submissions];
					} else if (payload.eventType === 'UPDATE') {
						submissions = submissions.map(s =>
							s.id === payload.new.id ? payload.new as Submission : s
						);
					}
				}
			)
			.subscribe((status) => {
				console.log('[Realtime] Subscription status:', status);
				if (status === 'SUBSCRIBED') {
					subscriptionStatus = 'connected';
					retryCount = 0;
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					subscriptionStatus = 'error';
					// Retry with exponential backoff
					if (retryCount < MAX_RETRIES) {
						retryCount++;
						const delay = Math.pow(2, retryCount) * 1000;
						console.log(`[Realtime] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
						setTimeout(() => setupRealtimeSubscription(), delay);
					}
				}
			});
	}

	async function startSession() {
		if (!session) return;
		try {
			const { error } = await supabase
				.from('sessions')
				.update({ status: 'active', started_at: new Date().toISOString() })
				.eq('id', sessionId);

			if (error) {
				console.error('Failed to start session:', error);
				alert('Failed to start session. Please try again.');
				return;
			}
			await loadSession();
		} catch (err) {
			console.error('Error starting session:', err);
			alert('Failed to start session. Please try again.');
		}
	}

	async function closeSession() {
		if (!session) return;
		try {
			const { error } = await supabase
				.from('sessions')
				.update({ status: 'closed', closed_at: new Date().toISOString() })
				.eq('id', sessionId);

			if (error) {
				console.error('Failed to close session:', error);
				alert('Failed to close session. Please try again.');
				return;
			}
			await loadSession();
		} catch (err) {
			console.error('Error closing session:', err);
			alert('Failed to close session. Please try again.');
		}
	}

	function refreshSubmissions() {
		loadSubmissions();
		// Also try to reconnect subscription if it failed
		if (subscriptionStatus === 'error') {
			retryCount = 0;
			setupRealtimeSubscription();
		}
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

	$: stats = {
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
	};
</script>

<div class="page">
	{#if loading}
		<div class="loading">Loading session...</div>
	{:else if loadError}
		<div class="error card">
			<h3>Error</h3>
			<p>{loadError}</p>
			<button class="btn-primary" on:click={() => { loadError = ''; loading = true; loadSession().then(() => { loading = false; }); }}>
				Try Again
			</button>
			<a href="/dashboard/sessions" class="btn-secondary">Back to Sessions</a>
		</div>
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
						<button class="btn-primary" on:click={startSession}>
							Start Session
						</button>
					{:else if session.status === 'active'}
						<button class="btn-danger" on:click={closeSession}>
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
			<div class="submissions-header">
				<h2>Submissions ({submissions.length})</h2>
				<div class="submissions-controls">
					{#if subscriptionStatus === 'error'}
						<span class="connection-status error">Live updates disconnected</span>
					{:else if subscriptionStatus === 'connecting'}
						<span class="connection-status connecting">Connecting...</span>
					{:else}
						<span class="connection-status connected">Live</span>
					{/if}
					<button class="btn-secondary btn-small" on:click={refreshSubmissions}>
						Refresh
					</button>
				</div>
			</div>
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

	.qr-section h2, .stats-section h2 {
		font-size: 1rem;
		margin-bottom: 1rem;
		color: var(--gray-700);
	}

	.submissions-section h2 {
		font-size: 1rem;
		margin-bottom: 0;
		color: var(--gray-700);
	}

	.submissions-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.submissions-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.connection-status {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
	}

	.connection-status.connected {
		background: #dcfce7;
		color: #166534;
	}

	.connection-status.connecting {
		background: #fef3c7;
		color: #92400e;
	}

	.connection-status.error {
		background: #fee2e2;
		color: #991b1b;
	}

	.btn-small {
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
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
