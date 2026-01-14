<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/stores/auth';
	import type { Question } from '$lib/types/database';
	import { nanoid } from 'nanoid';

	let questions = $state<Question[]>([]);
	let selectedQuestionId = $state('');
	let startImmediately = $state(true);
	let loading = $state(true);
	let creating = $state(false);

	onMount(async () => {
		const { data } = await supabase
			.from('questions')
			.select('*')
			.order('created_at', { ascending: false });

		questions = data || [];
		loading = false;

		// Pre-select question from URL param
		const questionParam = $page.url.searchParams.get('question');
		if (questionParam && questions.find(q => q.id === questionParam)) {
			selectedQuestionId = questionParam;
		}
	});

	async function createSession() {
		if (!$auth.user || !selectedQuestionId) return;

		creating = true;
		const code = nanoid(6).toUpperCase();

		const sessionData: any = {
			teacher_id: $auth.user.id,
			question_id: selectedQuestionId,
			code,
			status: startImmediately ? 'active' : 'waiting'
		};

		if (startImmediately) {
			sessionData.started_at = new Date().toISOString();
		}

		const { data, error } = await supabase
			.from('sessions')
			.insert(sessionData)
			.select()
			.single();

		if (data && !error) {
			goto(`/dashboard/sessions/${data.id}`);
		}

		creating = false;
	}

	const selectedQuestion = $derived(questions.find(q => q.id === selectedQuestionId));

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
	}
</script>

<div class="page">
	<header class="page-header">
		<a href="/dashboard/sessions" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m15 18-6-6 6-6"/>
			</svg>
			Back to Sessions
		</a>
		<div class="header-text">
			<h1>New Session</h1>
			<p>Select a question to start a live session</p>
		</div>
	</header>

	{#if loading}
		<div class="loading">Loading questions...</div>
	{:else if questions.length === 0}
		<div class="empty-state card">
			<div class="empty-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
				</svg>
			</div>
			<h3>No questions available</h3>
			<p>Create a question first before starting a session</p>
			<a href="/dashboard" class="btn-primary">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
				</svg>
				Create Question
			</a>
		</div>
	{:else}
		<div class="session-form card">
			<div class="field">
				<label for="question">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
					</svg>
					Select Question
				</label>
				<select id="question" bind:value={selectedQuestionId}>
					<option value="">Choose a question...</option>
					{#each questions as question}
						<option value={question.id}>{question.title}</option>
					{/each}
				</select>
			</div>

			{#if selectedQuestion}
				<div class="preview">
					<div class="preview-header">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
						</svg>
						Preview
					</div>
					<div class="preview-content">
						<div class="preview-title">{selectedQuestion.title}</div>
						{#if selectedQuestion.description}
							<p class="preview-desc">{selectedQuestion.description}</p>
						{/if}
						<div class="preview-meta">
							<span class="badge badge-info">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
								</svg>
								{selectedQuestion.max_points} pts
							</span>
							<span class="badge badge-warning">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
								</svg>
								{formatTime(selectedQuestion.time_limit_seconds)}
							</span>
						</div>
						<div class="model-answer">
							<div class="answer-label">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
								</svg>
								Model Answer
							</div>
							<pre>{selectedQuestion.model_answer}</pre>
						</div>
					</div>
				</div>
			{/if}

			<div class="options">
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={startImmediately} />
					<span class="checkbox-custom"></span>
					<span class="checkbox-label">
						<strong>Start immediately</strong>
						<span class="checkbox-desc">Session will be active and ready to receive submissions</span>
					</span>
				</label>
			</div>

			<button
				class="btn-primary create-btn"
				disabled={!selectedQuestionId || creating}
				onclick={createSession}
			>
				{#if creating}
					<span class="spinner"></span>
					{startImmediately ? 'Starting...' : 'Creating...'}
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						{#if startImmediately}
							<polygon points="6 3 20 12 6 21 6 3"/>
						{:else}
							<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
						{/if}
					</svg>
					{startImmediately ? 'Create & Start Session' : 'Create Session'}
				{/if}
			</button>
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

	.header-text h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
	}

	.header-text p {
		color: var(--slate-500);
		font-size: 0.9375rem;
	}

	.empty-state {
		max-width: 400px;
		margin: 2rem auto;
		text-align: center;
		padding: 3rem 2rem;
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

	.empty-state h3 {
		font-size: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.empty-state p {
		color: var(--slate-500);
		margin-bottom: 1.5rem;
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
	}

	.session-form {
		max-width: 600px;
	}

	.field {
		margin-bottom: 1.5rem;
	}

	.field label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--slate-700);
		margin-bottom: 0.5rem;
	}

	.preview {
		background: linear-gradient(135deg, var(--slate-50) 0%, var(--slate-100) 100%);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--slate-200);
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--slate-500);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 1rem;
	}

	.preview-title {
		font-family: 'Outfit', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--slate-800);
		margin-bottom: 0.5rem;
	}

	.preview-desc {
		font-size: 0.875rem;
		color: var(--slate-600);
		margin-bottom: 0.75rem;
	}

	.preview-meta {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.model-answer {
		background: white;
		padding: 1rem;
		border-radius: var(--radius-md);
	}

	.answer-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--primary-dark);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.model-answer pre {
		font-size: 0.8125rem;
		color: var(--slate-600);
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.6;
		margin: 0;
		font-family: inherit;
	}

	.options {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--slate-50);
		border-radius: var(--radius-lg);
		border: 1px solid var(--slate-200);
	}

	.checkbox-option {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		cursor: pointer;
	}

	.checkbox-option input {
		display: none;
	}

	.checkbox-custom {
		width: 22px;
		height: 22px;
		border: 2px solid var(--slate-300);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-top: 2px;
		transition: all var(--transition-base);
		background: white;
	}

	.checkbox-option input:checked + .checkbox-custom {
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
		border-color: var(--primary);
	}

	.checkbox-option input:checked + .checkbox-custom::after {
		content: '';
		width: 6px;
		height: 10px;
		border: solid white;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
		margin-bottom: 2px;
	}

	.checkbox-label {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.checkbox-label strong {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--slate-800);
	}

	.checkbox-desc {
		font-size: 0.8125rem;
		color: var(--slate-500);
	}

	.create-btn {
		width: 100%;
		padding: 0.875rem 1.5rem;
		font-size: 1rem;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
