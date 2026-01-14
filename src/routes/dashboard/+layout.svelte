<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth } from '$lib/stores/auth';

	let { children } = $props();

	// Redirect if not logged in
	$effect(() => {
		if (!$auth.loading && !$auth.user) {
			goto('/login');
		}
	});

	const navItems = [
		{
			href: '/dashboard',
			label: 'Questions',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`
		},
		{
			href: '/dashboard/sessions',
			label: 'Sessions',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`
		},
		{
			href: '/dashboard/analytics',
			label: 'Analytics',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`
		}
	];

	function isActive(href: string) {
		if (href === '/dashboard') {
			return $page.url.pathname === '/dashboard';
		}
		return $page.url.pathname.startsWith(href);
	}

	function getInitials(name: string | undefined): string {
		if (!name) return 'T';
		return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
	}
</script>

{#if $auth.user}
	<div class="dashboard">
		<aside class="sidebar">
			<div class="sidebar-header">
				<div class="logo">
					<div class="logo-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 2L2 7l10 5 10-5-10-5z"/>
							<path d="M2 17l10 5 10-5"/>
							<path d="M2 12l10 5 10-5"/>
						</svg>
					</div>
					<span class="logo-text">ZaliMark</span>
				</div>
			</div>

			<nav class="nav">
				<div class="nav-section">
					<span class="nav-label">Menu</span>
					{#each navItems as item, i}
						<a
							href={item.href}
							class="nav-item"
							class:active={isActive(item.href)}
							style="animation-delay: {i * 50}ms"
						>
							<span class="nav-icon">{@html item.icon}</span>
							<span class="nav-text">{item.label}</span>
							{#if isActive(item.href)}
								<span class="nav-indicator"></span>
							{/if}
						</a>
					{/each}
				</div>
			</nav>

			<div class="sidebar-footer">
				<div class="user-card">
					<div class="user-avatar">
						{getInitials($auth.teacher?.name)}
					</div>
					<div class="user-info">
						<span class="user-name">{$auth.teacher?.name || 'Teacher'}</span>
						<span class="user-email">{$auth.user.email}</span>
					</div>
				</div>
				<button class="sign-out-btn" onclick={() => auth.signOut()}>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
						<polyline points="16 17 21 12 16 7"/>
						<line x1="21" x2="9" y1="12" y2="12"/>
					</svg>
					Sign Out
				</button>
			</div>
		</aside>

		<main class="content">
			<div class="content-inner">
				{@render children()}
			</div>
		</main>
	</div>
{/if}

<style>
	.dashboard {
		display: flex;
		min-height: 100vh;
		background: var(--slate-100);
	}

	/* Sidebar */
	.sidebar {
		width: 260px;
		background: linear-gradient(180deg, var(--slate-900) 0%, var(--slate-800) 100%);
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 50;
		overflow-y: auto;
	}

	.sidebar-header {
		padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logo-icon {
		width: 40px;
		height: 40px;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
	}

	.logo-text {
		font-family: 'Outfit', sans-serif;
		font-size: 1.375rem;
		font-weight: 700;
		color: white;
		letter-spacing: -0.02em;
	}

	/* Navigation */
	.nav {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
	}

	.nav-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.nav-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--slate-500);
		padding: 0 0.75rem;
		margin-bottom: 0.5rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: var(--radius-lg);
		color: var(--slate-400);
		text-decoration: none;
		font-size: 0.9375rem;
		font-weight: 500;
		transition: all var(--transition-base);
		position: relative;
		animation: slideIn var(--transition-slow) ease-out backwards;
	}

	.nav-item:hover {
		color: white;
		background: rgba(255, 255, 255, 0.05);
	}

	.nav-item.active {
		color: white;
		background: rgba(20, 184, 166, 0.15);
	}

	.nav-item.active .nav-icon {
		color: var(--primary-light);
	}

	.nav-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		transition: color var(--transition-base);
	}

	.nav-text {
		flex: 1;
	}

	.nav-indicator {
		width: 6px;
		height: 6px;
		background: var(--primary);
		border-radius: 50%;
		box-shadow: 0 0 8px var(--primary);
	}

	/* Sidebar Footer */
	.sidebar-footer {
		padding: 1rem 1.5rem 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		margin-top: auto;
	}

	.user-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-lg);
		margin-bottom: 0.75rem;
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-family: 'Outfit', sans-serif;
		font-weight: 600;
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.user-name {
		font-weight: 500;
		font-size: 0.875rem;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-email {
		font-size: 0.75rem;
		color: var(--slate-500);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sign-out-btn {
		width: 100%;
		padding: 0.625rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		color: var(--slate-400);
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all var(--transition-base);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.sign-out-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		color: var(--error);
		border-color: rgba(239, 68, 68, 0.2);
	}

	/* Main Content */
	.content {
		flex: 1;
		margin-left: 260px;
		min-height: 100vh;
	}

	.content-inner {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
		animation: fadeIn var(--transition-slow) ease-out;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.sidebar {
			width: 240px;
		}

		.content {
			margin-left: 240px;
		}
	}

	@media (max-width: 768px) {
		.sidebar {
			transform: translateX(-100%);
			transition: transform var(--transition-base);
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.content {
			margin-left: 0;
		}

		.content-inner {
			padding: 1rem;
		}
	}
</style>
