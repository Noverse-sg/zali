<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth } from '$lib/stores/auth';

	// Redirect if not logged in
	$: if (!$auth.loading && !$auth.user) {
		goto('/login');
	}

	const navItems = [
		{ href: '/dashboard', label: 'Questions', icon: '?' },
		{ href: '/dashboard/sessions', label: 'Sessions', icon: '>' },
		{ href: '/dashboard/analytics', label: 'Analytics', icon: '#' }
	];
</script>

{#if $auth.user}
	<div class="dashboard">
		<aside class="sidebar">
			<div class="logo">QuizMark</div>
			<nav>
				{#each navItems as item}
					<a
						href={item.href}
						class="nav-item"
						class:active={$page.url.pathname === item.href}
					>
						<span class="icon">{item.icon}</span>
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="user-section">
				<div class="user-info">
					<span class="user-name">{$auth.teacher?.name || 'Teacher'}</span>
					<span class="user-email">{$auth.user.email}</span>
				</div>
				<button class="btn-secondary" on:click={() => auth.signOut()}>
					Sign Out
				</button>
			</div>
		</aside>
		<main class="content">
			<slot />
		</main>
	</div>
{/if}

<style>
	.dashboard {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		width: 240px;
		background: white;
		border-right: 1px solid var(--gray-200);
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
	}

	.logo {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--primary);
		margin-bottom: 2rem;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		color: var(--gray-600);
		text-decoration: none;
		transition: all 0.15s ease;
	}

	.nav-item:hover {
		background: var(--gray-100);
	}

	.nav-item.active {
		background: var(--primary);
		color: white;
	}

	.icon {
		width: 20px;
		text-align: center;
		font-weight: bold;
	}

	.user-section {
		border-top: 1px solid var(--gray-200);
		padding-top: 1rem;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		margin-bottom: 0.75rem;
	}

	.user-name {
		font-weight: 500;
		font-size: 0.875rem;
	}

	.user-email {
		font-size: 0.75rem;
		color: var(--gray-500);
	}

	.user-section button {
		width: 100%;
	}

	.content {
		flex: 1;
		padding: 2rem;
		overflow-y: auto;
	}
</style>
