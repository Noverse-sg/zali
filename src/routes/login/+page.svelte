<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/stores/auth';

	let email = '';
	let password = '';
	let loading = false;
	let error = '';
	let mode: 'login' | 'signup' = 'login';

	// Redirect if already logged in
	$: if ($auth.user) {
		goto('/dashboard');
	}

	async function handleSubmit() {
		loading = true;
		error = '';

		if (mode === 'login') {
			const { error: err } = await supabase.auth.signInWithPassword({ email, password });
			if (err) error = err.message;
			else goto('/dashboard');
		} else {
			const { error: err } = await supabase.auth.signUp({
				email,
				password,
				options: { data: { name: email.split('@')[0] } }
			});
			if (err) error = err.message;
			else goto('/dashboard');
		}

		loading = false;
	}
</script>

<div class="auth-container">
	<div class="auth-card card">
		<h1>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
		<p class="subtitle">
			{mode === 'login' ? 'Sign in to manage your quizzes' : 'Start creating interactive quizzes'}
		</p>

		<form on:submit|preventDefault={handleSubmit}>
			{#if error}
				<div class="error-msg">{error}</div>
			{/if}

			<div class="field">
				<label for="email">Email</label>
				<input
					type="email"
					id="email"
					bind:value={email}
					placeholder="you@school.edu"
					required
				/>
			</div>

			<div class="field">
				<label for="password">Password</label>
				<input
					type="password"
					id="password"
					bind:value={password}
					placeholder="••••••••"
					required
					minlength="6"
				/>
			</div>

			<button type="submit" class="btn-primary" disabled={loading}>
				{loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
			</button>
		</form>

		<p class="toggle-mode">
			{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
			<button class="link-btn" on:click={() => mode = mode === 'login' ? 'signup' : 'login'}>
				{mode === 'login' ? 'Sign up' : 'Sign in'}
			</button>
		</p>
	</div>
</div>

<style>
	.auth-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.auth-card {
		width: 100%;
		max-width: 400px;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: var(--gray-500);
		margin-bottom: 1.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--gray-700);
	}

	.error-msg {
		background: #fee2e2;
		color: #991b1b;
		padding: 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}

	form button {
		margin-top: 0.5rem;
		padding: 0.75rem;
	}

	.toggle-mode {
		text-align: center;
		margin-top: 1.5rem;
		font-size: 0.875rem;
		color: var(--gray-500);
	}

	.link-btn {
		background: none;
		color: var(--primary);
		padding: 0;
	}

	.link-btn:hover {
		text-decoration: underline;
	}
</style>
