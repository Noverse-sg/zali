<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/stores/auth';
	import type { Question } from '$lib/types/database';

	let questions = $state<Question[]>([]);
	let loading = $state(true);
	let showModal = $state(false);
	let editingQuestion = $state<Question | null>(null);

	// Form state
	let title = $state('');
	let description = $state('');
	let modelAnswer = $state('');
	let maxPoints = $state(10);
	let timeLimit = $state(300);
	let saving = $state(false);

	onMount(loadQuestions);

	async function loadQuestions() {
		loading = true;
		const { data } = await supabase
			.from('questions')
			.select('*')
			.order('created_at', { ascending: false });

		questions = data || [];
		loading = false;
	}

	function openModal(question?: Question) {
		if (question) {
			editingQuestion = question;
			title = question.title;
			description = question.description || '';
			modelAnswer = question.model_answer;
			maxPoints = question.max_points;
			timeLimit = question.time_limit_seconds;
		} else {
			editingQuestion = null;
			title = '';
			description = '';
			modelAnswer = '';
			maxPoints = 10;
			timeLimit = 300;
		}
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingQuestion = null;
	}

	async function saveQuestion() {
		if (!$auth.user) return;
		saving = true;

		const questionData = {
			teacher_id: $auth.user.id,
			title,
			description: description || null,
			model_answer: modelAnswer,
			max_points: maxPoints,
			time_limit_seconds: timeLimit
		};

		if (editingQuestion) {
			await supabase
				.from('questions')
				.update({ ...questionData, updated_at: new Date().toISOString() })
				.eq('id', editingQuestion.id);
		} else {
			await supabase.from('questions').insert(questionData);
		}

		saving = false;
		closeModal();
		loadQuestions();
	}

	async function deleteQuestion(id: string) {
		if (!confirm('Delete this question?')) return;
		await supabase.from('questions').delete().eq('id', id);
		loadQuestions();
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
	}
</script>

<div class="page">
	<header class="page-header">
		<div>
			<h1>Questions</h1>
			<p>Create and manage your question bank</p>
		</div>
		<button class="btn-primary" onclick={() => openModal()}>
			+ New Question
		</button>
	</header>

	{#if loading}
		<div class="loading">Loading questions...</div>
	{:else if questions.length === 0}
		<div class="empty-state card">
			<h3>No questions yet</h3>
			<p>Create your first question to get started</p>
			<button class="btn-primary" onclick={() => openModal()}>
				Create Question
			</button>
		</div>
	{:else}
		<div class="questions-grid">
			{#each questions as question}
				<div class="card question-card">
					<div class="question-header">
						<h3>{question.title}</h3>
						<div class="question-meta">
							<span class="badge badge-info">{question.max_points} pts</span>
							<span class="badge badge-warning">{formatTime(question.time_limit_seconds)}</span>
						</div>
					</div>
					{#if question.description}
						<p class="question-desc">{question.description}</p>
					{/if}
					{#if question.model_answer}
					<div class="question-answer">
						<strong>Model Answer:</strong>
						<p>{question.model_answer.slice(0, 150)}{question.model_answer.length > 150 ? '...' : ''}</p>
					</div>
				{/if}
					<div class="question-actions">
						<button class="btn-secondary" onclick={() => openModal(question)}>
							Edit
						</button>
						<a href="/dashboard/sessions/new?question={question.id}" class="btn-primary">
							Start Session
						</a>
						<button class="btn-danger" onclick={() => deleteQuestion(question.id)}>
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if showModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeModal}>
		<div class="modal card" onclick={(e) => e.stopPropagation()}>
			<h2>{editingQuestion ? 'Edit Question' : 'New Question'}</h2>

			<form onsubmit={(e) => { e.preventDefault(); saveQuestion(); }}>
				<div class="field">
					<label for="title">Title</label>
					<input
						type="text"
						id="title"
						bind:value={title}
						placeholder="e.g., Quadratic Equations"
						required
					/>
				</div>

				<div class="field">
					<label for="description">Description (optional)</label>
					<textarea
						id="description"
						bind:value={description}
						placeholder="Additional context or instructions..."
						rows="2"
					></textarea>
				</div>

				<div class="field">
					<label for="modelAnswer">Model Answer / Rubric</label>
					<textarea
						id="modelAnswer"
						bind:value={modelAnswer}
						placeholder="The correct answer or marking criteria..."
						rows="5"
						required
					></textarea>
				</div>

				<div class="field-row">
					<div class="field">
						<label for="maxPoints">Max Points</label>
						<input
							type="number"
							id="maxPoints"
							bind:value={maxPoints}
							min="1"
							max="100"
							required
						/>
					</div>
					<div class="field">
						<label for="timeLimit">Time Limit (seconds)</label>
						<input
							type="number"
							id="timeLimit"
							bind:value={timeLimit}
							min="30"
							max="3600"
							required
						/>
					</div>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-secondary" onclick={closeModal}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={saving}>
						{saving ? 'Saving...' : editingQuestion ? 'Update' : 'Create'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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

	.questions-grid {
		display: grid;
		gap: 1rem;
	}

	.question-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.question-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.question-header h3 {
		font-size: 1.1rem;
	}

	.question-meta {
		display: flex;
		gap: 0.5rem;
	}

	.question-desc {
		color: var(--gray-600);
		font-size: 0.875rem;
	}

	.question-answer {
		background: var(--gray-50);
		padding: 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}

	.question-answer strong {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--gray-700);
	}

	.question-answer p {
		color: var(--gray-600);
	}

	.question-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.question-actions a {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		background: var(--primary);
		color: white;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
	}

	.modal {
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal h2 {
		margin-bottom: 1.5rem;
	}

	.field {
		margin-bottom: 1rem;
	}

	.field label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--gray-700);
		margin-bottom: 0.25rem;
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}
</style>
