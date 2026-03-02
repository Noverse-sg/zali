<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Question } from '$lib/types/database';

	export let data: PageData;

	// Use supabase client from layout (has auth session)
	$: ({ supabase } = data);

	// Reactive questions from server data
	$: questions = data.questions as Question[];

	let showModal = false;
	let editingQuestion: Question | null = null;

	// Form state
	let title = '';
	let description = '';
	let maxPoints = 10;
	let timeLimit = 300;
	let saving = false;
	let saveError = '';

	// Answer key file state
	let answerKeyFile: File | null = null;
	let answerKeyPreview: string | null = null;
	let existingAnswerKeyUrl: string | null = null;
	let existingAnswerKeyType: string | null = null;
	let fileInputEl: HTMLInputElement;

	function openModal(question?: Question) {
		if (question) {
			editingQuestion = question;
			title = question.title;
			description = question.description || '';
			maxPoints = question.max_points;
			timeLimit = question.time_limit_seconds;
			existingAnswerKeyUrl = question.answer_key_url || null;
			existingAnswerKeyType = question.answer_key_type || null;
		} else {
			editingQuestion = null;
			title = '';
			description = '';
			maxPoints = 10;
			timeLimit = 300;
			existingAnswerKeyUrl = null;
			existingAnswerKeyType = null;
		}
		answerKeyFile = null;
		answerKeyPreview = null;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingQuestion = null;
		saveError = '';
	}

	function handleAnswerKeySelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		answerKeyFile = file;
		existingAnswerKeyUrl = null;
		existingAnswerKeyType = null;

		// Generate preview for images
		if (file.type.startsWith('image/')) {
			const reader = new FileReader();
			reader.onload = (e) => {
				answerKeyPreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		} else {
			answerKeyPreview = null;
		}
	}

	function removeAnswerKey() {
		answerKeyFile = null;
		answerKeyPreview = null;
		existingAnswerKeyUrl = null;
		existingAnswerKeyType = null;
		if (fileInputEl) fileInputEl.value = '';
	}

	function getFileDisplayName(url: string, mimeType: string | null): string {
		if (mimeType?.startsWith('image/')) return 'Image file';
		if (mimeType === 'application/pdf') return 'PDF file';
		if (mimeType?.startsWith('text/')) return 'Text file';
		// Extract filename from URL
		const parts = url.split('/');
		return parts[parts.length - 1] || 'Uploaded file';
	}

	async function saveQuestion() {
		if (!data.user) return;

		// Validate: must have a file (new or existing)
		if (!answerKeyFile && !existingAnswerKeyUrl) {
			saveError = 'Please upload an answer key file.';
			return;
		}

		saving = true;
		saveError = '';

		try {
			let answerKeyUrl = existingAnswerKeyUrl;
			let answerKeyType = existingAnswerKeyType;
			let modelAnswer: string | null = null;

			// Upload new file if selected
			if (answerKeyFile) {
				answerKeyType = answerKeyFile.type;
				const fileExt = answerKeyFile.name.split('.').pop() || 'bin';
				const fileName = `${data.user.id}/${Date.now()}.${fileExt}`;

				const { error: uploadError } = await supabase.storage
					.from('answer-keys')
					.upload(fileName, answerKeyFile, {
						contentType: answerKeyFile.type,
						upsert: true
					});

				if (uploadError) {
					console.error('Failed to upload answer key:', uploadError);
					saveError = 'Failed to upload file. Please try again.';
					saving = false;
					return;
				}

				const { data: urlData } = supabase.storage
					.from('answer-keys')
					.getPublicUrl(fileName);

				answerKeyUrl = urlData.publicUrl;

				// For text files, also extract content into model_answer for backward compat
				if (answerKeyFile.type.startsWith('text/')) {
					modelAnswer = await answerKeyFile.text();
				}
			}

			const questionData = {
				teacher_id: data.user.id,
				title,
				description: description || null,
				model_answer: modelAnswer,
				answer_key_url: answerKeyUrl,
				answer_key_type: answerKeyType,
				max_points: maxPoints,
				time_limit_seconds: timeLimit
			};

			if (editingQuestion) {
				const { error } = await supabase
					.from('questions')
					.update({ ...questionData, updated_at: new Date().toISOString() })
					.eq('id', editingQuestion.id);

				if (error) {
					console.error('Failed to update question:', error);
					saveError = 'Failed to save question. Please try again.';
					saving = false;
					return;
				}
			} else {
				const { error } = await supabase.from('questions').insert(questionData);

				if (error) {
					console.error('Failed to create question:', error);
					saveError = 'Failed to create question. Please try again.';
					saving = false;
					return;
				}
			}

			saving = false;
			closeModal();
			invalidateAll();
		} catch (err) {
			console.error('Error saving question:', err);
			saveError = 'An unexpected error occurred. Please try again.';
			saving = false;
		}
	}

	async function deleteQuestion(id: string) {
		if (!confirm('Delete this question?')) return;

		try {
			const { error } = await supabase.from('questions').delete().eq('id', id);

			if (error) {
				console.error('Failed to delete question:', error);
				alert('Failed to delete question. Please try again.');
				return;
			}

			// Refresh data from server
			invalidateAll();
		} catch (err) {
			console.error('Error deleting question:', err);
			alert('An unexpected error occurred. Please try again.');
		}
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
		<button class="btn-primary" on:click={() => openModal()}>
			+ New Question
		</button>
	</header>

	{#if questions.length === 0}
		<div class="empty-state card">
			<h3>No questions yet</h3>
			<p>Create your first question to get started</p>
			<button class="btn-primary" on:click={() => openModal()}>
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
					{#if question.answer_key_url}
						<div class="question-answer">
							<strong>Answer Key:</strong>
							{#if question.answer_key_type?.startsWith('image/')}
								<img src={question.answer_key_url} alt="Answer key" class="answer-key-thumb" />
							{:else if question.answer_key_type === 'application/pdf'}
								<p>PDF file uploaded</p>
							{:else if question.model_answer}
								<p>{question.model_answer.slice(0, 150)}{question.model_answer.length > 150 ? '...' : ''}</p>
							{:else}
								<p>Text file uploaded</p>
							{/if}
						</div>
					{:else if question.model_answer}
						<div class="question-answer">
							<strong>Model Answer:</strong>
							<p>{question.model_answer.slice(0, 150)}{question.model_answer.length > 150 ? '...' : ''}</p>
						</div>
					{/if}
					<div class="question-actions">
						<button class="btn-secondary" on:click={() => openModal(question)}>
							Edit
						</button>
						<a href="/dashboard/sessions/new?question={question.id}" class="btn-primary">
							Start Session
						</a>
						<button class="btn-danger" on:click={() => deleteQuestion(question.id)}>
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
	<div class="modal-overlay" on:click={closeModal}>
		<div class="modal card" on:click={(e) => e.stopPropagation()}>
			<h2>{editingQuestion ? 'Edit Question' : 'New Question'}</h2>

			<form on:submit|preventDefault={saveQuestion}>
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
					<label for="answerKey">Answer Key (Image, PDF, or Text file)</label>

					{#if answerKeyFile}
						<div class="file-preview">
							{#if answerKeyPreview}
								<img src={answerKeyPreview} alt="Answer key preview" class="answer-key-img" />
							{:else}
								<div class="file-info">
									<span class="file-icon">
										{#if answerKeyFile.type === 'application/pdf'}
											PDF
										{:else}
											TXT
										{/if}
									</span>
									<span class="file-name">{answerKeyFile.name}</span>
								</div>
							{/if}
							<button type="button" class="btn-remove" on:click={removeAnswerKey}>Remove</button>
						</div>
					{:else if existingAnswerKeyUrl}
						<div class="file-preview">
							{#if existingAnswerKeyType?.startsWith('image/')}
								<img src={existingAnswerKeyUrl} alt="Answer key" class="answer-key-img" />
							{:else}
								<div class="file-info">
									<span class="file-icon">
										{#if existingAnswerKeyType === 'application/pdf'}
											PDF
										{:else}
											TXT
										{/if}
									</span>
									<span class="file-name">{getFileDisplayName(existingAnswerKeyUrl, existingAnswerKeyType)}</span>
								</div>
							{/if}
							<button type="button" class="btn-remove" on:click={removeAnswerKey}>Remove</button>
						</div>
					{:else}
						<div
							class="upload-area"
							on:click={() => fileInputEl.click()}
							on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputEl.click(); }}
							role="button"
							tabindex="0"
						>
							<span class="upload-icon">+</span>
							<span>Click to upload answer key</span>
							<span class="upload-hint">Supports images, PDF, and text files</span>
						</div>
					{/if}

					<input
						type="file"
						id="answerKey"
						accept="image/*,.pdf,.txt,text/plain,application/pdf"
						bind:this={fileInputEl}
						on:change={handleAnswerKeySelect}
						style="display: none"
					/>
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

				{#if saveError}
					<div class="save-error">{saveError}</div>
				{/if}

				<div class="modal-actions">
					<button type="button" class="btn-secondary" on:click={closeModal}>
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

	.empty-state {
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

	.save-error {
		color: var(--error);
		font-size: 0.875rem;
		padding: 0.5rem;
		background: #fee2e2;
		border-radius: 0.375rem;
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

	/* File upload styles */
	.upload-area {
		border: 2px dashed var(--gray-300);
		border-radius: 0.5rem;
		padding: 1.5rem;
		text-align: center;
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.upload-area:hover {
		border-color: var(--primary);
		background: var(--gray-50);
	}

	.upload-icon {
		font-size: 1.5rem;
		color: var(--gray-400);
		font-weight: 300;
	}

	.upload-area span {
		font-size: 0.875rem;
		color: var(--gray-600);
	}

	.upload-hint {
		font-size: 0.75rem !important;
		color: var(--gray-400) !important;
	}

	.file-preview {
		border: 1px solid var(--gray-200);
		border-radius: 0.5rem;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.answer-key-img {
		max-width: 100%;
		max-height: 200px;
		border-radius: 0.375rem;
		object-fit: contain;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
	}

	.file-icon {
		background: var(--gray-100);
		color: var(--gray-600);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.file-name {
		font-size: 0.875rem;
		color: var(--gray-700);
	}

	.btn-remove {
		background: none;
		border: 1px solid var(--error);
		color: var(--error);
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.btn-remove:hover {
		background: #fee2e2;
	}

	.answer-key-thumb {
		max-width: 100%;
		max-height: 100px;
		border-radius: 0.375rem;
		object-fit: contain;
		margin-top: 0.25rem;
	}
</style>
