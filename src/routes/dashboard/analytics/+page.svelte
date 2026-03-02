<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	interface SessionAnalytics {
		id: string;
		code: string;
		questionTitle: string;
		createdAt: string;
		totalSubmissions: number;
		avgScore: number;
		maxScore: number;
		commonMistakes: { mistake: string; count: number }[];
	}

	$: sessions = data.analyticsData as SessionAnalytics[];

	let selectedSession: SessionAnalytics | null = null;

	function formatDate(date: string) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getScoreColor(score: number, max: number) {
		const percentage = (score / max) * 100;
		if (percentage >= 70) return 'var(--success)';
		if (percentage >= 50) return 'var(--warning)';
		return 'var(--error)';
	}
</script>

<div class="page">
	<header class="page-header">
		<h1>Analytics</h1>
		<p>View performance data and common mistakes across your sessions</p>
	</header>

	{#if sessions.length === 0}
		<div class="empty-state card">
			<h3>No data yet</h3>
			<p>Complete some quiz sessions to see analytics here</p>
		</div>
	{:else}
		<div class="analytics-grid">
			<div class="sessions-list">
				<h2>Sessions</h2>
				{#each sessions as session}
					<button
						class="card session-item"
						class:selected={selectedSession?.id === session.id}
						on:click={() => selectedSession = session}
					>
						<div class="session-header">
							<strong>{session.questionTitle}</strong>
							<span class="date">{formatDate(session.createdAt)}</span>
						</div>
						<div class="session-stats">
							<span>{session.totalSubmissions} submissions</span>
							<span
								class="avg-score"
								style="color: {getScoreColor(session.avgScore, session.maxScore)}"
							>
								Avg: {session.avgScore}/{session.maxScore}
							</span>
						</div>
					</button>
				{/each}
			</div>

			<div class="details-panel">
				{#if selectedSession}
					<div class="card">
						<h2>{selectedSession.questionTitle}</h2>
						<p class="session-code">Code: {selectedSession.code}</p>

						<div class="stats-row">
							<div class="stat-box">
								<span class="stat-value">{selectedSession.totalSubmissions}</span>
								<span class="stat-label">Total Submissions</span>
							</div>
							<div class="stat-box">
								<span
									class="stat-value"
									style="color: {getScoreColor(selectedSession.avgScore, selectedSession.maxScore)}"
								>
									{selectedSession.avgScore}
								</span>
								<span class="stat-label">Average Score (/{selectedSession.maxScore})</span>
							</div>
						</div>

						{#if selectedSession.commonMistakes.length > 0}
							<div class="mistakes-section">
								<h3>Common Mistakes</h3>
								<p class="section-desc">Areas where students need improvement</p>
								<ul class="mistakes-list">
									{#each selectedSession.commonMistakes as { mistake, count }}
										<li>
											<span class="mistake-text">{mistake}</span>
											<span class="mistake-count">{count} student{count !== 1 ? 's' : ''}</span>
										</li>
									{/each}
								</ul>
							</div>
						{:else}
							<div class="no-mistakes">
								<p>No common mistakes identified yet.</p>
							</div>
						{/if}
					</div>
				{:else}
					<div class="card empty-panel">
						<p>Select a session to view detailed analytics</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.page-header {
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

	.analytics-grid {
		display: grid;
		grid-template-columns: 350px 1fr;
		gap: 1.5rem;
		align-items: start;
	}

	.sessions-list h2, .details-panel h2 {
		font-size: 1rem;
		color: var(--gray-700);
		margin-bottom: 1rem;
	}

	.session-item {
		width: 100%;
		text-align: left;
		margin-bottom: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.session-item:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.session-item.selected {
		border: 2px solid var(--primary);
	}

	.session-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.session-header strong {
		font-size: 0.9rem;
	}

	.date {
		font-size: 0.75rem;
		color: var(--gray-400);
	}

	.session-stats {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: var(--gray-500);
	}

	.avg-score {
		font-weight: 600;
	}

	.session-code {
		font-family: monospace;
		color: var(--gray-500);
		margin-bottom: 1.5rem;
	}

	.stats-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.stat-box {
		background: var(--gray-50);
		padding: 1rem;
		border-radius: 0.5rem;
		text-align: center;
	}

	.stat-value {
		display: block;
		font-size: 2rem;
		font-weight: 700;
		color: var(--gray-900);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--gray-500);
	}

	.mistakes-section h3 {
		font-size: 0.9rem;
		color: var(--gray-800);
		margin-bottom: 0.25rem;
	}

	.section-desc {
		font-size: 0.8rem;
		color: var(--gray-500);
		margin-bottom: 1rem;
	}

	.mistakes-list {
		list-style: none;
	}

	.mistakes-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: #fef3c7;
		border-radius: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.mistake-text {
		font-size: 0.875rem;
		color: #78350f;
	}

	.mistake-count {
		font-size: 0.75rem;
		color: #92400e;
		font-weight: 500;
	}

	.no-mistakes, .empty-panel {
		text-align: center;
		padding: 2rem;
		color: var(--gray-500);
	}

	@media (max-width: 768px) {
		.analytics-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
