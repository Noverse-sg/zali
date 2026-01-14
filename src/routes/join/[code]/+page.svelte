<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import type { Session, Question } from '$lib/types/database';

	type SessionWithQuestion = Session & { questions: Question };

	let session: SessionWithQuestion | null = null;
	let loading = true;
	let error = '';
	let step: 'name' | 'capture' | 'submitting' | 'result' = 'name';

	let studentName = '';
	let capturedImage: string | null = null;
	let fileInput: HTMLInputElement;

	let submissionResult: {
		score: number | null;
		maxScore: number;
		feedback: string;
		markedImageUrl: string | null;
		mistakes: string[];
	} | null = null;

	let timeRemaining = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	const code = $page.params.code;

	onMount(async () => {
		const { data } = await supabase
			.from('sessions')
			.select('*, questions(*)')
			.eq('code', code.toUpperCase())
			.single();

		if (data) {
			session = data as SessionWithQuestion;
			if (session.status === 'closed') {
				error = 'This session has ended.';
			} else if (session.status === 'waiting') {
				error = 'This session has not started yet. Please wait.';
			}
		} else {
			error = 'Session not found. Please check the code.';
		}

		loading = false;
	});

	function startTimer() {
		if (!session) return;
		timeRemaining = session.questions.time_limit_seconds;

		timerInterval = setInterval(() => {
			timeRemaining--;
			if (timeRemaining <= 0) {
				if (timerInterval) clearInterval(timerInterval);
				if (capturedImage) {
					submitAnswer();
				}
			}
		}, 1000);
	}

	function handleNameSubmit() {
		if (studentName.trim()) {
			step = 'capture';
			startTimer();
		}
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				capturedImage = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	async function submitAnswer() {
		if (!session || !capturedImage) return;

		step = 'submitting';
		if (timerInterval) clearInterval(timerInterval);

		// Upload original image to Supabase storage
		const imageData = capturedImage.split(',')[1];
		const imageBlob = await fetch(capturedImage).then(r => r.blob());
		const fileName = `${session.id}/${Date.now()}_${studentName.replace(/\s+/g, '_')}.png`;

		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('submissions')
			.upload(fileName, imageBlob, { contentType: 'image/png' });

		if (uploadError) {
			error = 'Failed to upload image. Please try again.';
			step = 'capture';
			return;
		}

		const { data: urlData } = supabase.storage
			.from('submissions')
			.getPublicUrl(fileName);

		// Create submission record
		const { data: submission, error: submitError } = await supabase
			.from('submissions')
			.insert({
				session_id: session.id,
				student_name: studentName,
				original_image_url: urlData.publicUrl,
				max_score: session.questions.max_points,
				status: 'pending'
			})
			.select()
			.single();

		if (submitError || !submission) {
			error = 'Failed to submit. Please try again.';
			step = 'capture';
			return;
		}

		// Call the marking API
		const response = await fetch('/api/mark', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				submissionId: submission.id,
				imageBase64: imageData,
				modelAnswer: session.questions.model_answer,
				maxPoints: session.questions.max_points
			})
		});

		const result = await response.json();

		if (result.success) {
			submissionResult = {
				score: result.score,
				maxScore: session.questions.max_points,
				feedback: result.feedback,
				markedImageUrl: result.markedImageUrl,
				mistakes: result.mistakes || []
			};
			step = 'result';
		} else {
			error = result.error || 'Marking failed. Your submission was saved.';
			step = 'result';
			submissionResult = {
				score: null,
				maxScore: session.questions.max_points,
				feedback: 'Your submission is being processed. Check back later.',
				markedImageUrl: null,
				mistakes: []
			};
		}
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class="container">
	{#if loading}
		<div class="loading-screen">
			<div class="spinner"></div>
			<p>Loading session...</p>
		</div>
	{:else if error && step === 'name'}
		<div class="card error-card">
			<h2>Oops!</h2>
			<p>{error}</p>
		</div>
	{:else if session}
		{#if step === 'name'}
			<div class="card">
				<h1>Join Quiz</h1>
				<p class="question-title">{session.questions.title}</p>
				{#if session.questions.description}
					<p class="question-desc">{session.questions.description}</p>
				{/if}
				<div class="meta">
					<span>{session.questions.max_points} points</span>
					<span>{formatTime(session.questions.time_limit_seconds)} time limit</span>
				</div>

				<form on:submit|preventDefault={handleNameSubmit}>
					<div class="field">
						<label for="name">Your Name</label>
						<input
							type="text"
							id="name"
							bind:value={studentName}
							placeholder="Enter your name"
							required
						/>
					</div>
					<button type="submit" class="btn-primary">Start Quiz</button>
				</form>
			</div>
		{:else if step === 'capture'}
			<div class="card capture-card">
				<div class="timer" class:warning={timeRemaining <= 30}>
					{formatTime(timeRemaining)}
				</div>

				<h2>Submit Your Answer</h2>
				<p>Take a photo or upload an image of your written solution.</p>

				{#if capturedImage}
					<div class="preview">
						<img src={capturedImage} alt="Your answer" />
						<button class="btn-secondary" on:click={() => { capturedImage = null; }}>
							Retake
						</button>
					</div>
				{:else}
					<div class="capture-options">
						<button class="btn-primary capture-btn" on:click={() => fileInput.click()}>
							Take Photo / Upload
						</button>
						<input
							type="file"
							accept="image/*"
							capture="environment"
							bind:this={fileInput}
							on:change={handleFileSelect}
							style="display: none"
						/>
					</div>
				{/if}

				{#if capturedImage}
					<button class="btn-primary submit-btn" on:click={submitAnswer}>
						Submit Answer
					</button>
				{/if}
			</div>
		{:else if step === 'submitting'}
			<div class="card">
				<div class="loading-screen">
					<div class="spinner"></div>
					<h2>Marking your answer...</h2>
					<p>AI is analyzing your work. This may take a moment.</p>
				</div>
			</div>
		{:else if step === 'result'}
			<div class="card result-card">
				<h2>Results</h2>

				{#if submissionResult}
					{#if submissionResult.score !== null}
						<div class="score">
							<span class="score-value">{submissionResult.score}</span>
							<span class="score-max">/ {submissionResult.maxScore}</span>
						</div>
					{:else}
						<p class="pending-msg">Score pending...</p>
					{/if}

					<p class="feedback">{submissionResult.feedback}</p>

					{#if submissionResult.markedImageUrl}
						<div class="marked-image">
							<h3>Marked Answer</h3>
							<img src={submissionResult.markedImageUrl} alt="Marked answer" />
						</div>
					{/if}

					{#if submissionResult.mistakes.length > 0}
						<div class="mistakes">
							<h3>Areas for Improvement</h3>
							<ul>
								{#each submissionResult.mistakes as mistake}
									<li>{mistake}</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.card {
		width: 100%;
		max-width: 400px;
		background: white;
		border-radius: 0.75rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		padding: 1.5rem;
	}

	.loading-screen {
		text-align: center;
		padding: 2rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-card {
		text-align: center;
	}

	.error-card h2 {
		color: var(--error);
		margin-bottom: 0.5rem;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.question-title {
		font-weight: 500;
		margin-bottom: 0.25rem;
	}

	.question-desc {
		font-size: 0.875rem;
		color: var(--gray-600);
		margin-bottom: 0.5rem;
	}

	.meta {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--gray-500);
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

	form button {
		width: 100%;
		padding: 0.75rem;
	}

	.capture-card {
		text-align: center;
	}

	.timer {
		font-size: 2rem;
		font-weight: 700;
		font-family: monospace;
		margin-bottom: 1rem;
	}

	.timer.warning {
		color: var(--error);
		animation: pulse 1s ease infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.capture-card h2 {
		font-size: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.capture-card > p {
		font-size: 0.875rem;
		color: var(--gray-600);
		margin-bottom: 1.5rem;
	}

	.preview {
		margin-bottom: 1rem;
	}

	.preview img {
		max-width: 100%;
		max-height: 300px;
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.capture-btn {
		width: 100%;
		padding: 1rem;
		font-size: 1rem;
	}

	.submit-btn {
		width: 100%;
		padding: 0.75rem;
		margin-top: 1rem;
	}

	.result-card {
		text-align: center;
	}

	.score {
		margin: 1.5rem 0;
	}

	.score-value {
		font-size: 4rem;
		font-weight: 700;
		color: var(--primary);
	}

	.score-max {
		font-size: 1.5rem;
		color: var(--gray-500);
	}

	.pending-msg {
		font-size: 1.25rem;
		color: var(--warning);
		margin: 1.5rem 0;
	}

	.feedback {
		font-size: 0.875rem;
		color: var(--gray-600);
		margin-bottom: 1.5rem;
	}

	.marked-image {
		margin-bottom: 1.5rem;
	}

	.marked-image h3 {
		font-size: 0.875rem;
		color: var(--gray-700);
		margin-bottom: 0.5rem;
	}

	.marked-image img {
		max-width: 100%;
		border-radius: 0.5rem;
		border: 1px solid var(--gray-200);
	}

	.mistakes {
		text-align: left;
		background: #fef3c7;
		padding: 1rem;
		border-radius: 0.5rem;
	}

	.mistakes h3 {
		font-size: 0.875rem;
		color: #92400e;
		margin-bottom: 0.5rem;
	}

	.mistakes ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.875rem;
		color: #78350f;
	}
</style>
