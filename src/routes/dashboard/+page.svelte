<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/stores/auth';
	import type { Question } from '$lib/types/database';
	import { nanoid } from 'nanoid';

	let questions = $state<Question[]>([]);
	let loading = $state(true);
	let showModal = $state(false);
	let editingQuestion = $state<Question | null>(null);
	let startingSession = $state<string | null>(null);

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

	async function startSession(questionId: string) {
		if (!$auth.user) return;

		startingSession = questionId;
		const code = nanoid(6).toUpperCase();

		const { data, error } = await supabase
			.from('sessions')
			.insert({
				teacher_id: $auth.user.id,
				question_id: questionId,
				code,
				status: 'active',
				started_at: new Date().toISOString()
			})
			.select()
			.single();

		if (data && !error) {
			goto(`/dashboard/sessions/${data.id}`);
		}

		startingSession = null;
	}
</script>

<div class="page">
	<header class="page-header">
		<div class="header-text">
			<h1>Questions</h1>
			<p>Create and manage your question bank</p>
		</div>
		<button class="btn-primary" onclick={() => openModal()}>
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
			</svg>
			New Question
		</button>
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
			<h3>No questions yet</h3>
			<p>Create your first question to start building your assessment library</p>
			<button class="btn-primary" onclick={() => openModal()}>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
				</svg>
				Create Question
			</button>
		</div>
	{:else}
		<div class="questions-grid">
			{#each questions as question, i}
				<div class="card question-card" style="animation-delay: {i * 50}ms">
					<div class="question-header">
						<h3>{question.title}</h3>
						<div class="question-meta">
							<span class="badge badge-info">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
								</svg>
								{question.max_points} pts
							</span>
							<span class="badge badge-warning">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
								</svg>
								{formatTime(question.time_limit_seconds)}
							</span>
						</div>
					</div>
					{#if question.description}
						<p class="question-desc">{question.description}</p>
					{/if}
					{#if question.model_answer}
						<div class="question-answer">
							<div class="answer-label">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
								</svg>
								Model Answer
							</div>
							<p>{question.model_answer.slice(0, 150)}{question.model_answer.length > 150 ? '...' : ''}</p>
						</div>
					{/if}
					<div class="question-actions">
						<button class="btn-secondary" onclick={() => openModal(question)}>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
							</svg>
							Edit
						</button>
						<button
							class="btn-start"
							onclick={() => startSession(question.id)}
							disabled={startingSession === question.id}
						>
							{#if startingSession === question.id}
								<span class="spinner"></span>
								Starting...
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polygon points="6 3 20 12 6 21 6 3"/>
								</svg>
								Start Session
							{/if}
						</button>
						<button class="btn-icon-danger" onclick={() => deleteQuestion(question.id)}>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
							</svg>
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
			<div class="modal-header">
				<h2>{editingQuestion ? 'Edit Question' : 'New Question'}</h2>
				<button class="modal-close" onclick={closeModal}>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
					</svg>
				</button>
			</div>

			<form onsubmit={(e) => { e.preventDefault(); saveQuestion(); }}>
				<div class="field">
					<label for="title">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
						</svg>
						Title
					</label>
					<input
						type="text"
						id="title"
						bind:value={title}
						placeholder="e.g., Quadratic Equations"
						required
					/>
				</div>

				<div class="field">
					<label for="description">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>
						</svg>
						Description
						<span class="optional">(optional)</span>
					</label>
					<textarea
						id="description"
						bind:value={description}
						placeholder="Additional context or instructions..."
						rows="2"
					></textarea>
				</div>

				<div class="field">
					<label for="modelAnswer">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
						</svg>
						Model Answer / Rubric
					</label>
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
						<label for="maxPoints">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
							</svg>
							Max Points
						</label>
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
						<label for="timeLimit">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
							</svg>
							Time Limit (seconds)
						</label>
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
						{#if saving}
							<span class="spinner"></span>
							Saving...
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
							</svg>
							{editingQuestion ? 'Update' : 'Create'}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.page {
		animation: slideUp var(--transition-slow) ease-out;
	}

	.header-text h1 {
		margin-bottom: 0.25rem;
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

	.questions-grid {
		display: grid;
		gap: 1.25rem;
	}

	.question-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		animation: slideUp var(--transition-slow) ease-out backwards;
	}

	.question-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.question-header h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--slate-800);
	}

	.question-meta {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.question-desc {
		color: var(--slate-600);
		font-size: 0.9375rem;
		line-height: 1.5;
	}

	.question-answer {
		background: linear-gradient(135deg, var(--slate-50) 0%, var(--slate-100) 100%);
		padding: 1rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--slate-200);
	}

	.answer-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--primary-dark);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.question-answer p {
		color: var(--slate-600);
		font-size: 0.875rem;
		line-height: 1.6;
	}

	.question-actions {
		display: flex;
		gap: 0.625rem;
		margin-top: 0.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--slate-100);
	}

	.btn-start {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		font-weight: 500;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
		color: white;
		box-shadow: var(--shadow-md), 0 2px 8px rgba(20, 184, 166, 0.25);
		transition: all var(--transition-base);
		border: none;
		cursor: pointer;
	}

	.btn-start:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: var(--shadow-lg), 0 4px 12px rgba(20, 184, 166, 0.35);
	}

	.btn-start:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.btn-icon-danger {
		padding: 0.625rem;
		background: var(--slate-50);
		color: var(--slate-500);
		border: 1px solid var(--slate-200);
		border-radius: var(--radius-lg);
		margin-left: auto;
	}

	.btn-icon-danger:hover {
		background: var(--error-bg);
		color: var(--error);
		border-color: rgba(239, 68, 68, 0.2);
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
		animation: fadeIn var(--transition-fast) ease-out;
	}

	.modal {
		width: 100%;
		max-width: 520px;
		max-height: 90vh;
		overflow-y: auto;
		animation: slideUp var(--transition-base) ease-out;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.modal-header h2 {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.modal-close {
		padding: 0.5rem;
		background: var(--slate-100);
		color: var(--slate-500);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-close:hover {
		background: var(--slate-200);
		color: var(--slate-700);
	}

	.field {
		margin-bottom: 1.25rem;
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

	.field label .optional {
		font-weight: 400;
		color: var(--slate-400);
		font-size: 0.8125rem;
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--slate-200);
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
</style>
