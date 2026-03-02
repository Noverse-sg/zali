<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createClient } from '@supabase/supabase-js';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import type { PageData } from './$types';
	import type { Session, Question, Submission } from '$lib/types/database';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	export let data: PageData;

	type SessionWithQuestion = Session & { questions: Question };

	// Session from server
	$: session = data.session as SessionWithQuestion | null;
	$: serverError = data.error as string | null;

	// Create a client-side supabase for storage and realtime (students aren't logged in)
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	let step: 'name' | 'capture' | 'submitting' | 'result' = 'name';
	let clientError = '';

	let studentName = '';
	let capturedImage: string | null = null;
	let fileInput: HTMLInputElement;
	let cameraInput: HTMLInputElement;

	let submissionResult: {
		score: number | null;
		maxScore: number;
		feedback: string;
		markedImageUrl: string | null;
		mistakes: string[];
		status: string;
	} | null = null;

	let timeRemaining = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let submissionSubscription: RealtimeChannel | null = null;
	let currentSubmissionId: string | null = null;
	let markingStatus = 'Uploading your answer...';

	onDestroy(() => {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
		if (submissionSubscription) {
			submissionSubscription.unsubscribe();
			submissionSubscription = null;
		}
	});

	function subscribeToSubmission(submissionId: string) {
		currentSubmissionId = submissionId;

		submissionSubscription = supabase
			.channel(`submission-${submissionId}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'submissions',
					filter: `id=eq.${submissionId}`
				},
				(payload) => {
					const updated = payload.new as Submission;
					console.log('[Subscription] Submission updated:', updated.status);

					if (submissionResult) {
						submissionResult = {
							...submissionResult,
							score: updated.score,
							feedback: updated.feedback || submissionResult.feedback,
							markedImageUrl: updated.marked_image_url,
							mistakes: updated.mistakes || [],
							status: updated.status
						};
					}

					if (updated.marked_image_url) {
						console.log('[Subscription] Marked image received');
					}
				}
			)
			.subscribe((status) => {
				console.log('[Subscription] Status:', status);
			});
	}

	function startTimer() {
		if (!session) return;

		// Clear any existing timer first
		if (timerInterval) {
			clearInterval(timerInterval);
		}

		timeRemaining = session.questions.time_limit_seconds;

		timerInterval = setInterval(() => {
			timeRemaining--;
			if (timeRemaining <= 0) {
				if (timerInterval) clearInterval(timerInterval);
				timerInterval = null;
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

	/**
	 * Compress an image to fit within maxWidth/maxHeight and target ~500KB
	 */
	function compressImage(dataUrl: string, maxWidth = 1600, maxHeight = 1600): Promise<string> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				let { width, height } = img;

				// Scale down if larger than max dimensions
				if (width > maxWidth || height > maxHeight) {
					const ratio = Math.min(maxWidth / width, maxHeight / height);
					width = Math.round(width * ratio);
					height = Math.round(height * ratio);
				}

				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				if (!ctx) { reject(new Error('Canvas not supported')); return; }

				ctx.drawImage(img, 0, 0, width, height);

				// Use JPEG at 0.7 quality for smaller file size
				resolve(canvas.toDataURL('image/jpeg', 0.7));
			};
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = dataUrl;
		});
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = async (e) => {
				try {
					const raw = e.target?.result as string;
					capturedImage = await compressImage(raw);
				} catch {
					capturedImage = e.target?.result as string;
				}
			};
			reader.onerror = () => {
				clientError = 'Failed to read image. Please try again.';
			};
			reader.readAsDataURL(file);
		}
	}

	async function submitAnswer() {
		if (!session || !capturedImage) return;

		step = 'submitting';
		markingStatus = 'Uploading your answer...';
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}

		try {
			const imageData = capturedImage.split(',')[1];
			let imageBlob: Blob;

			try {
				imageBlob = await fetch(capturedImage).then(r => r.blob());
			} catch (err) {
				console.error('Failed to convert image:', err);
				clientError = 'Failed to process image. Please try again.';
				step = 'capture';
				return;
			}

			const fileName = `${session.id}/${Date.now()}_${studentName.replace(/\s+/g, '_')}.png`;

			const { error: uploadError } = await supabase.storage
				.from('submissions')
				.upload(fileName, imageBlob, { contentType: 'image/png' });

			if (uploadError) {
				console.error('Upload error:', uploadError);
				clientError = 'Failed to upload image. Please try again.';
				step = 'capture';
				return;
			}

			const { data: urlData } = supabase.storage
				.from('submissions')
				.getPublicUrl(fileName);

			markingStatus = 'Creating submission...';

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
				console.error('Submit error:', submitError);
				clientError = 'Failed to submit. Please try again.';
				step = 'capture';
				return;
			}

			subscribeToSubmission(submission.id);

			markingStatus = 'AI is analyzing your answer...';

			let response: Response;
			try {
				response = await fetch('/api/mark', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						submissionId: submission.id,
						imageBase64: imageData,
						modelAnswer: session.questions.model_answer || '',
						maxPoints: session.questions.max_points,
						answerKeyUrl: session.questions.answer_key_url || null,
						answerKeyType: session.questions.answer_key_type || null
					})
				});
			} catch (err) {
				console.error('Network error calling mark API:', err);
				clientError = 'Network error. Your submission was saved but marking failed.';
				step = 'result';
				submissionResult = {
					score: null,
					maxScore: session.questions.max_points,
					feedback: 'Your submission is saved. Marking will be retried.',
					markedImageUrl: null,
					mistakes: [],
					status: 'error'
				};
				return;
			}

			if (!response.ok) {
				console.error('Mark API error:', response.status);
				clientError = 'Marking service error. Your submission was saved.';
				step = 'result';
				submissionResult = {
					score: null,
					maxScore: session.questions.max_points,
					feedback: 'Your submission is saved. Please check back later.',
					markedImageUrl: null,
					mistakes: [],
					status: 'error'
				};
				return;
			}

			const result = await response.json();

			if (result.success) {
				submissionResult = {
					score: result.score,
					maxScore: session.questions.max_points,
					feedback: result.feedback,
					markedImageUrl: result.markedImageUrl,
					mistakes: result.mistakes || [],
					status: 'completed'
				};
				step = 'result';
			} else {
				clientError = result.error || 'Marking failed. Your submission was saved.';
				step = 'result';
				submissionResult = {
					score: null,
					maxScore: session.questions.max_points,
					feedback: 'Your submission is being processed. Check back later.',
					markedImageUrl: null,
					mistakes: [],
					status: 'error'
				};
			}
		} catch (err) {
			console.error('Submission error:', err);
			clientError = 'An unexpected error occurred. Please try again.';
			step = 'capture';
		}
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class="container">
	{#if serverError}
		<div class="card error-card">
			<h2>Oops!</h2>
			<p>{serverError}</p>
		</div>
	{:else if !session}
		<div class="card error-card">
			<h2>Session Not Found</h2>
			<p>Please check the join code and try again.</p>
		</div>
	{:else if step === 'name'}
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
					<button class="btn-primary capture-btn" on:click={() => cameraInput.click()}>
						Take Photo
					</button>
					<button class="btn-secondary capture-btn" on:click={() => fileInput.click()}>
						Upload from Gallery
					</button>
					<input
						type="file"
						accept="image/*"
						capture="environment"
						bind:this={cameraInput}
						on:change={handleFileSelect}
						style="display: none"
					/>
					<input
						type="file"
						accept="image/*"
						bind:this={fileInput}
						on:change={handleFileSelect}
						style="display: none"
					/>
				</div>
			{/if}

			{#if clientError}
				<div class="client-error">{clientError}</div>
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
				<h2>Processing...</h2>
				<p>{markingStatus}</p>
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
				{:else if submissionResult.status === 'completed'}
					<div class="marked-image-loading">
						<div class="spinner-small"></div>
						<p>Generating marked image...</p>
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

	.capture-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.capture-btn {
		width: 100%;
		padding: 1rem;
		font-size: 1rem;
	}

	.client-error {
		color: var(--error);
		font-size: 0.875rem;
		padding: 0.5rem;
		background: #fee2e2;
		border-radius: 0.375rem;
		margin-top: 1rem;
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

	.marked-image-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem;
		background: var(--gray-50);
		border-radius: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.marked-image-loading p {
		font-size: 0.875rem;
		color: var(--gray-600);
		margin: 0;
	}

	.spinner-small {
		width: 24px;
		height: 24px;
		border: 2px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
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
