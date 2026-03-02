<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="error-page">
	<div class="error-card">
		<h1>{$page.status}</h1>
		<h2>
			{#if $page.status === 404}
				Page Not Found
			{:else if $page.status === 401}
				Unauthorized
			{:else if $page.status === 500}
				Server Error
			{:else}
				Something Went Wrong
			{/if}
		</h2>
		<p>{$page.error?.message || 'An unexpected error occurred.'}</p>
		<div class="actions">
			<a href="/" class="btn-primary">Go Home</a>
			<button class="btn-secondary" on:click={() => history.back()}>Go Back</button>
		</div>
	</div>
</div>

<style>
	.error-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--gray-50);
	}

	.error-card {
		text-align: center;
		background: white;
		padding: 3rem 2rem;
		border-radius: 0.75rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		max-width: 400px;
		width: 100%;
	}

	h1 {
		font-size: 5rem;
		font-weight: 700;
		color: var(--primary);
		margin-bottom: 0.5rem;
		line-height: 1;
	}

	h2 {
		font-size: 1.5rem;
		color: var(--gray-900);
		margin-bottom: 0.5rem;
	}

	p {
		color: var(--gray-600);
		margin-bottom: 2rem;
	}

	.actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.actions a {
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 500;
		background: var(--primary);
		color: white;
	}

	.actions button {
		padding: 0.75rem 1.5rem;
	}
</style>
