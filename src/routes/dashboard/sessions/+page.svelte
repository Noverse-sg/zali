<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { Session, Question } from '$lib/types/database';

	type SessionWithQuestion = Session & { questions: Question };

	let sessions: SessionWithQuestion[] = [];
	let loading = true;
	let loadError = '';

	onMount(loadSessions);

	async function loadSessions() {
		loading = true;
		loadError = '';

		try {
			const { data, error } = await supabase
				.from('sessions')
				.select('*, questions(*)')
				.order('created_at', { ascending: false });

			if (error) {
				console.error('Failed to load sessions:', error);
				loadError = 'Failed to load sessions. Please try again.';
				loading = false;
				return;
			}

			sessions = (data as SessionWithQuestion[]) || [];
		} catch (err) {
			console.error('Error loading sessions:', err);
			loadError = 'An unexpected error occurred. Please try again.';
		}

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

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="page">
	<header class="page-header">
		<div>
			<h1>Sessions</h1>
			<p>View and manage your quiz sessions</p>
		</div>
		<a href="/dashboard/sessions/new" class="btn-primary">
			+ New Session
		</a>
	</header>

	{#if loading}
		<div class="loading">Loading sessions...</div>
	{:else if loadError}
		<div class="error-state card">
			<h3>Error</h3>
			<p>{loadError}</p>
			<button class="btn-primary" on:click={loadSessions}>Try Again</button>
		</div>
	{:else if sessions.length === 0}
		<div class="empty-state card">
			<h3>No sessions yet</h3>
			<p>Start a session from your questions page</p>
			<a href="/dashboard" class="btn-primary">Go to Questions</a>
		</div>
	{:else}
		<div class="sessions-list">
			{#each sessions as session}
				<a href="/dashboard/sessions/{session.id}" class="card session-card">
					<div class="session-info">
						<h3>{session.questions?.title || 'Unknown Question'}</h3>
						<p>Code: <strong>{session.code}</strong></p>
						<p class="date">{formatDate(session.created_at)}</p>
					</div>
					<div class="session-status">
						<span class="badge {getStatusColor(session.status)}">
							{session.status}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}

	.page-header p {
		color: var(--gray-500);
		font-size: 0.875rem;
	}

	.page-header a {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		background: var(--primary);
		color: white;
	}

	.loading, .empty-state, .error-state {
		text-align: center;
		padding: 3rem;
	}

	.empty-state h3, .error-state h3 {
		margin-bottom: 0.5rem;
	}

	.empty-state p, .error-state p {
		color: var(--gray-500);
		margin-bottom: 1rem;
	}

	.error-state h3 {
		color: var(--error);
	}

	.empty-state a {
		text-decoration: none;
		display: inline-flex;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		background: var(--primary);
		color: white;
	}

	.sessions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.session-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		text-decoration: none;
		color: inherit;
		transition: box-shadow 0.15s ease;
	}

	.session-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.session-info h3 {
		font-size: 1rem;
		margin-bottom: 0.25rem;
	}

	.session-info p {
		font-size: 0.875rem;
		color: var(--gray-600);
	}

	.session-info .date {
		font-size: 0.75rem;
		color: var(--gray-400);
	}
</style>
