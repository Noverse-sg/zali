<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { Session, Question } from '$lib/types/database';

	type SessionWithQuestion = Session & { questions: Question };

	let sessions = $state<SessionWithQuestion[]>([]);
	let loading = $state(true);

	onMount(loadSessions);

	async function loadSessions() {
		loading = true;
		const { data } = await supabase
			.from('sessions')
			.select('*, questions(*)')
			.order('created_at', { ascending: false });

		sessions = (data as SessionWithQuestion[]) || [];
		loading = false;
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'active': return 'badge-success';
			case 'waiting': return 'badge-warning';
			case 'closed': return 'badge-error';
			default: return 'badge-info';
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'active':
				return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="4"/></svg>`;
			case 'waiting':
				return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
			case 'closed':
				return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
			default:
				return '';
		}
	}

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getRelativeTime(date: string): string {
		const now = new Date();
		const then = new Date(date);
		const diffMs = now.getTime() - then.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return formatDate(date);
	}
</script>

<div class="page">
	<header class="page-header">
		<div class="header-text">
			<h1>Sessions</h1>
			<p>View and manage your assessment sessions</p>
		</div>
		<a href="/dashboard/sessions/new" class="btn-primary">
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
			</svg>
			New Session
		</a>
	</header>

	{#if loading}
		<div class="loading">Loading sessions...</div>
	{:else if sessions.length === 0}
		<div class="empty-state card">
			<div class="empty-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/>
				</svg>
			</div>
			<h3>No sessions yet</h3>
			<p>Start a session from your questions to begin collecting student submissions</p>
			<a href="/dashboard" class="btn-primary">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
				</svg>
				Go to Questions
			</a>
		</div>
	{:else}
		<div class="sessions-list">
			{#each sessions as session, i}
				<a href="/dashboard/sessions/{session.id}" class="session-card card" style="animation-delay: {i * 50}ms">
					<div class="session-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
						</svg>
					</div>
					<div class="session-content">
						<div class="session-main">
							<h3>{session.questions?.title || 'Unknown Question'}</h3>
							<div class="session-meta">
								<span class="session-code">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
									</svg>
									{session.code}
								</span>
								<span class="session-time">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
									</svg>
									{getRelativeTime(session.created_at)}
								</span>
							</div>
						</div>
						<div class="session-status">
							<span class="badge {getStatusColor(session.status)}">
								{@html getStatusIcon(session.status)}
								{session.status}
							</span>
						</div>
					</div>
					<div class="session-arrow">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="m9 18 6-6-6-6"/>
						</svg>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		animation: slideUp var(--transition-slow) ease-out;
	}

	.header-text h1 {
		margin-bottom: 0.25rem;
	}

	.page-header a {
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
		box-shadow: var(--shadow-md), 0 2px 8px rgba(20, 184, 166, 0.25);
		transition: all var(--transition-base);
	}

	.page-header a:hover {
		transform: translateY(-1px);
		box-shadow: var(--shadow-lg), 0 4px 12px rgba(20, 184, 166, 0.35);
	}

	.empty-state {
		max-width: 400px;
		margin: 2rem auto;
	}

	.empty-icon {
		width: 80px;
		height: 80px;
		background: var(--primary-glow);
		border-radius: var(--radius-2xl);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.5rem;
		color: var(--primary);
	}

	.empty-state a {
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
		box-shadow: var(--shadow-md), 0 2px 8px rgba(20, 184, 166, 0.25);
		transition: all var(--transition-base);
	}

	.empty-state a:hover {
		transform: translateY(-1px);
		box-shadow: var(--shadow-lg), 0 4px 12px rgba(20, 184, 166, 0.35);
	}

	.sessions-list {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.session-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		text-decoration: none;
		color: inherit;
		animation: slideUp var(--transition-slow) ease-out backwards;
	}

	.session-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-lg);
	}

	.session-card:hover .session-arrow {
		transform: translateX(4px);
		color: var(--primary);
	}

	.session-icon {
		width: 48px;
		height: 48px;
		background: linear-gradient(135deg, var(--slate-100) 0%, var(--slate-50) 100%);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--slate-500);
		flex-shrink: 0;
	}

	.session-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
	}

	.session-main {
		min-width: 0;
	}

	.session-main h3 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--slate-800);
		margin-bottom: 0.375rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.session-meta {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.session-code, .session-time {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--slate-500);
	}

	.session-code {
		font-family: 'Outfit', monospace;
		font-weight: 600;
		color: var(--primary-dark);
		background: var(--primary-glow);
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-md);
	}

	.session-status {
		flex-shrink: 0;
	}

	.session-arrow {
		color: var(--slate-400);
		transition: all var(--transition-base);
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.session-card {
			flex-wrap: wrap;
		}

		.session-content {
			flex-direction: column;
			align-items: flex-start;
		}

		.session-arrow {
			display: none;
		}
	}
</style>
