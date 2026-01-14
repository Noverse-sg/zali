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
				color: { dark: '#0f172a', light: '#ffffff' }
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

	function getSessionStatusColor(status: string) {
		switch (status) {
			case 'active': return 'status-active';
			case 'waiting': return 'status-waiting';
			case 'closed': return 'status-closed';
			default: return '';
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

	function copyCode() {
		if (session?.code) {
			navigator.clipboard.writeText(session.code);
		}
	}

	function copyUrl() {
		navigator.clipboard.writeText(joinUrl);
	}
</script>

<div class="page">
	{#if loading}
		<div class="loading">Loading session...</div>
	{:else if !session}
		<div class="error card">
			<div class="empty-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
				</svg>
			</div>
			<h3>Session not found</h3>
			<p>This session may have been deleted or doesn't exist</p>
			<a href="/dashboard/sessions" class="btn-primary">Back to Sessions</a>
		</div>
	{:else}
		<header class="page-header">
			<a href="/dashboard/sessions" class="back-link">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m15 18-6-6 6-6"/>
				</svg>
				Back to Sessions
			</a>
			<div class="header-content">
				<div class="header-text">
					<h1>{session.questions.title}</h1>
					<div class="header-meta">
						<button class="code-badge" onclick={copyCode} title="Click to copy">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
							</svg>
							{session.code}
						</button>
						<span class="session-status-badge {getSessionStatusColor(session.status)}">
							{#if session.status === 'active'}
								<span class="pulse"></span>
							{/if}
							{session.status}
						</span>
					</div>
				</div>
				<div class="session-controls">
					{#if session.status === 'waiting'}
						<button class="btn-primary" onclick={startSession}>
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polygon points="6 3 20 12 6 21 6 3"/>
							</svg>
							Start Session
						</button>
					{:else if session.status === 'active'}
						<button class="btn-danger" onclick={closeSession}>
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="3" width="18" height="18" rx="2"/>
							</svg>
							Close Session
						</button>
					{/if}
				</div>
			</div>
		</header>

		<div class="session-grid">
			<div class="card qr-section">
				<div class="qr-header">
					<h2>
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
						</svg>
						QR Code
					</h2>
					<button class="btn-icon" onclick={copyUrl} title="Copy join URL">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
						</svg>
					</button>
				</div>
				<p class="join-url">{joinUrl}</p>
				{#if qrCodeUrl}
					<div class="qr-wrapper">
						<img src={qrCodeUrl} alt="QR Code to join session" class="qr-code" />
					</div>
				{/if}
				<p class="instruction">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>
					</svg>
					Students scan to join
				</p>
			</div>

			<div class="card stats-section">
				<h2>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
					</svg>
					Statistics
				</h2>
				<div class="stats-grid">
					<div class="stat stat-total">
						<span class="stat-value">{stats.total}</span>
						<span class="stat-label">Total</span>
					</div>
					<div class="stat stat-pending">
						<span class="stat-value">{stats.pending}</span>
						<span class="stat-label">Pending</span>
					</div>
					<div class="stat stat-marking">
						<span class="stat-value">{stats.marking}</span>
						<span class="stat-label">Marking</span>
					</div>
					<div class="stat stat-completed">
						<span class="stat-value">{stats.completed}</span>
						<span class="stat-label">Completed</span>
					</div>
				</div>
				{#if stats.avgScore !== null}
					<div class="avg-score">
						<div class="avg-score-label">Average Score</div>
						<div class="avg-score-value">
							<span class="score">{stats.avgScore}</span>
							<span class="max">/ {session.questions.max_points}</span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="card submissions-section">
			<div class="submissions-header">
				<h2>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>
					</svg>
					Submissions
					<span class="count">{submissions.length}</span>
				</h2>
			</div>
			{#if submissions.length === 0}
				<div class="no-submissions">
					<div class="empty-icon-small">
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
							<path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>
						</svg>
					</div>
					<p>No submissions yet. Waiting for students...</p>
				</div>
			{:else}
				<div class="submissions-list">
					{#each submissions as submission, i}
						<div class="submission-item" style="animation-delay: {i * 50}ms">
							<div class="submission-header">
								<div class="student-info">
									<div class="student-avatar">
										{submission.student_name.charAt(0).toUpperCase()}
									</div>
									<div class="student-details">
										<strong>{submission.student_name}</strong>
										<span class="badge {getStatusColor(submission.status)}">{submission.status}</span>
									</div>
								</div>
								{#if submission.status === 'completed'}
									<div class="submission-score">
										<span class="score-value">{submission.score}</span>
										<span class="score-max">/ {submission.max_score}</span>
									</div>
								{/if}
							</div>

							<div class="submission-images">
								<div class="image-card">
									<span class="image-label">Original</span>
									<a href={submission.original_image_url} target="_blank" class="image-link">
										<img src={submission.original_image_url} alt="Original submission" class="submission-thumbnail" />
										<div class="image-overlay">
											<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
											</svg>
										</div>
									</a>
								</div>
								{#if submission.marked_image_url}
									<div class="image-card">
										<span class="image-label marked-label">Marked</span>
										<a href={submission.marked_image_url} target="_blank" class="image-link">
											<img src={submission.marked_image_url} alt="Marked submission" class="submission-thumbnail" />
											<div class="image-overlay">
												<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
												</svg>
											</div>
										</a>
									</div>
								{/if}
							</div>

							{#if submission.feedback}
								<div class="submission-feedback">
									<div class="feedback-label">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
										</svg>
										Feedback
									</div>
									<p>{submission.feedback}</p>
								</div>
							{/if}

							{#if submission.mistakes && submission.mistakes.length > 0}
								<div class="submission-mistakes">
									<div class="mistakes-label">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
										</svg>
										Areas for Improvement
									</div>
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
	.page {
		animation: slideUp var(--transition-slow) ease-out;
	}

	.page-header {
		margin-bottom: 2rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--slate-500);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 1rem;
		transition: color var(--transition-base);
	}

	.back-link:hover {
		color: var(--primary);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.header-text h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.code-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: var(--primary-glow);
		color: var(--primary-dark);
		font-family: 'Outfit', monospace;
		font-weight: 700;
		font-size: 0.9375rem;
		border-radius: var(--radius-md);
		border: none;
		cursor: pointer;
		transition: all var(--transition-base);
	}

	.code-badge:hover {
		background: rgba(20, 184, 166, 0.25);
	}

	.session-status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: var(--radius-full);
		text-transform: capitalize;
	}

	.status-active {
		background: var(--success-bg);
		color: #15803d;
	}

	.status-waiting {
		background: var(--warning-bg);
		color: #b45309;
	}

	.status-closed {
		background: var(--error-bg);
		color: #b91c1c;
	}

	.pulse {
		width: 8px;
		height: 8px;
		background: currentColor;
		border-radius: 50%;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(1.2); }
	}

	.session-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.error {
		text-align: center;
		padding: 4rem 2rem;
		max-width: 400px;
		margin: 2rem auto;
	}

	.empty-icon {
		width: 80px;
		height: 80px;
		background: var(--error-bg);
		border-radius: var(--radius-2xl);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.5rem;
		color: var(--error);
	}

	.error h3 {
		font-size: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.error p {
		color: var(--slate-500);
		margin-bottom: 1.5rem;
	}

	.error a {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		font-weight: 500;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
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
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: var(--slate-700);
	}

	.qr-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.qr-header h2 {
		margin-bottom: 0;
	}

	.btn-icon {
		padding: 0.5rem;
		background: var(--slate-100);
		color: var(--slate-500);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		cursor: pointer;
		transition: all var(--transition-base);
	}

	.btn-icon:hover {
		background: var(--slate-200);
		color: var(--slate-700);
	}

	.join-url {
		font-size: 0.75rem;
		color: var(--slate-500);
		word-break: break-all;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: var(--slate-50);
		border-radius: var(--radius-md);
	}

	.qr-wrapper {
		display: inline-block;
		padding: 1rem;
		background: white;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		margin-bottom: 1rem;
	}

	.qr-code {
		display: block;
		border-radius: var(--radius-md);
	}

	.instruction {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		color: var(--slate-500);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 0.5rem;
		background: var(--slate-50);
		border-radius: var(--radius-lg);
		transition: all var(--transition-base);
	}

	.stat:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.stat-total { background: linear-gradient(135deg, var(--slate-100) 0%, var(--slate-50) 100%); }
	.stat-pending { background: linear-gradient(135deg, var(--info-bg) 0%, rgba(59, 130, 246, 0.05) 100%); }
	.stat-marking { background: linear-gradient(135deg, var(--warning-bg) 0%, rgba(245, 158, 11, 0.05) 100%); }
	.stat-completed { background: linear-gradient(135deg, var(--success-bg) 0%, rgba(34, 197, 94, 0.05) 100%); }

	.stat-value {
		font-family: 'Outfit', sans-serif;
		font-size: 2rem;
		font-weight: 700;
		color: var(--slate-800);
		line-height: 1;
	}

	.stat-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--slate-500);
		margin-top: 0.25rem;
	}

	.avg-score {
		padding-top: 1rem;
		border-top: 1px solid var(--slate-200);
	}

	.avg-score-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--slate-500);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	.avg-score-value {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.25rem;
	}

	.avg-score-value .score {
		font-family: 'Outfit', sans-serif;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--primary);
	}

	.avg-score-value .max {
		font-size: 1rem;
		color: var(--slate-400);
	}

	.submissions-section h2 {
		justify-content: flex-start;
	}

	.submissions-header {
		margin-bottom: 1rem;
	}

	.submissions-header h2 .count {
		background: var(--slate-200);
		color: var(--slate-600);
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		margin-left: 0.25rem;
	}

	.no-submissions {
		text-align: center;
		padding: 3rem;
	}

	.empty-icon-small {
		width: 60px;
		height: 60px;
		background: var(--slate-100);
		border-radius: var(--radius-xl);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1rem;
		color: var(--slate-400);
	}

	.no-submissions p {
		color: var(--slate-500);
		font-size: 0.9375rem;
	}

	.submissions-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.submission-item {
		padding: 1.25rem;
		background: var(--slate-50);
		border-radius: var(--radius-lg);
		border: 1px solid var(--slate-100);
		animation: slideUp var(--transition-slow) ease-out backwards;
	}

	.submission-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.student-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.student-avatar {
		width: 40px;
		height: 40px;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-family: 'Outfit', sans-serif;
		font-weight: 600;
		font-size: 1rem;
	}

	.student-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.student-details strong {
		font-size: 1rem;
		font-weight: 600;
		color: var(--slate-800);
	}

	.submission-score {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
		padding: 0.5rem 1rem;
		background: var(--primary-glow);
		border-radius: var(--radius-lg);
	}

	.score-value {
		font-family: 'Outfit', sans-serif;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--primary-dark);
	}

	.score-max {
		font-size: 1rem;
		color: var(--slate-500);
	}

	.submission-images {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.image-card {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.image-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--slate-600);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.marked-label {
		color: var(--primary-dark);
	}

	.image-link {
		position: relative;
		display: block;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.submission-thumbnail {
		width: 200px;
		height: 150px;
		object-fit: cover;
		display: block;
		transition: transform var(--transition-base);
	}

	.image-overlay {
		position: absolute;
		inset: 0;
		background: rgba(15, 23, 42, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		opacity: 0;
		transition: opacity var(--transition-base);
	}

	.image-link:hover .submission-thumbnail {
		transform: scale(1.05);
	}

	.image-link:hover .image-overlay {
		opacity: 1;
	}

	.submission-feedback {
		background: white;
		padding: 1rem;
		border-radius: var(--radius-md);
		margin-bottom: 0.75rem;
	}

	.feedback-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--slate-500);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.submission-feedback p {
		font-size: 0.9375rem;
		color: var(--slate-700);
		line-height: 1.6;
	}

	.submission-mistakes {
		background: var(--error-bg);
		padding: 1rem;
		border-radius: var(--radius-md);
	}

	.mistakes-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--error);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.submission-mistakes ul {
		margin: 0;
		padding-left: 1.25rem;
	}

	.submission-mistakes li {
		font-size: 0.875rem;
		color: var(--slate-700);
		margin-bottom: 0.25rem;
	}

	.submission-mistakes li:last-child {
		margin-bottom: 0;
	}

	@media (max-width: 768px) {
		.session-grid {
			grid-template-columns: 1fr;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.header-content {
			flex-direction: column;
		}

		.submission-images {
			flex-direction: column;
		}

		.submission-thumbnail {
			width: 100%;
			height: auto;
			aspect-ratio: 4/3;
		}
	}
</style>
