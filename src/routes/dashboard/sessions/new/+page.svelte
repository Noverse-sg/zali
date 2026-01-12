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

		const { data, error } = await supabase
			.from('sessions')
			.insert({
				teacher_id: $auth.user.id,
				question_id: selectedQuestionId,
				code,
				status: 'waiting'
			})
			.select()
			.single();

		if (data && !error) {
			goto(`/dashboard/sessions/${data.id}`);
		}

		creating = false;
	}

	const selectedQuestion = $derived(questions.find(q => q.id === selectedQuestionId));
</script>

<div class="page">
	<header class="page-header">
		<a href="/dashboard/sessions" class="back-link">Back to Sessions</a>
		<h1>New Session</h1>
		<p>Select a question to start a live session</p>
	</header>

	{#if loading}
		<div class="loading">Loading questions...</div>
	{:else if questions.length === 0}
		<div class="empty-state card">
			<h3>No questions available</h3>
			<p>Create a question first before starting a session</p>
			<a href="/dashboard" class="btn-primary">Create Question</a>
		</div>
	{:else}
		<div class="session-form card">
			<div class="field">
				<label for="question">Select Question</label>
				<select id="question" bind:value={selectedQuestionId}>
					<option value="">Choose a question...</option>
					{#each questions as question}
						<option value={question.id}>{question.title}</option>
					{/each}
				</select>
			</div>

			{#if selectedQuestion}
				<div class="preview">
					<h3>Preview</h3>
					<div class="preview-content">
						<p><strong>Title:</strong> {selectedQuestion.title}</p>
						{#if selectedQuestion.description}
							<p><strong>Description:</strong> {selectedQuestion.description}</p>
						{/if}
						<p><strong>Points:</strong> {selectedQuestion.max_points}</p>
						<p><strong>Time Limit:</strong> {Math.floor(selectedQuestion.time_limit_seconds / 60)}m {selectedQuestion.time_limit_seconds % 60}s</p>
						<div class="model-answer">
							<strong>Model Answer:</strong>
							<pre>{selectedQuestion.model_answer}</pre>
						</div>
					</div>
				</div>
			{/if}

			<button
				class="btn-primary create-btn"
				disabled={!selectedQuestionId || creating}
				onclick={createSession}
			>
				{creating ? 'Creating...' : 'Create Session'}
			</button>
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

	.page-header h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}

	.page-header p {
		color: var(--gray-500);
		font-size: 0.875rem;
	}

	.loading, .empty-state {
		text-align: center;
		padding: 3rem;
	}

	.empty-state h3 {
		margin-bottom: 0.5rem;
	}

	.empty-state p {
		color: var(--gray-500);
		margin-bottom: 1rem;
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

	.session-form {
		max-width: 600px;
	}

	.field {
		margin-bottom: 1.5rem;
	}

	.field label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--gray-700);
		margin-bottom: 0.5rem;
	}

	.preview {
		background: var(--gray-50);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.preview h3 {
		font-size: 0.875rem;
		color: var(--gray-700);
		margin-bottom: 0.75rem;
	}

	.preview-content p {
		font-size: 0.875rem;
		color: var(--gray-600);
		margin-bottom: 0.5rem;
	}

	.model-answer {
		margin-top: 0.75rem;
		font-size: 0.875rem;
	}

	.model-answer strong {
		display: block;
		color: var(--gray-700);
		margin-bottom: 0.25rem;
	}

	.model-answer pre {
		background: white;
		padding: 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		overflow-x: auto;
		white-space: pre-wrap;
		color: var(--gray-600);
	}

	.create-btn {
		width: 100%;
		padding: 0.75rem;
	}
</style>
