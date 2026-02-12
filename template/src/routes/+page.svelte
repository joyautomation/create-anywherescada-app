<script lang="ts">
	import { ChevronDown, ChevronRight } from '@joyautomation/salt/icons';
	import type { SparkplugGroup, MetricUpdate } from '$lib/types';

	const { data } = $props();

	// svelte-ignore state_referenced_locally — initialized from server, then updated via SSE
	let groups = $state<SparkplugGroup[]>(data.groups);
	let connected = $state(false);
	// svelte-ignore state_referenced_locally
	let error = $state<string | null>(data.error);

	let expandedGroups = $state<Set<string>>(new Set());
	let expandedNodes = $state<Set<string>>(new Set());
	let expandedDevices = $state<Set<string>>(new Set());

	function toggleSet(set: Set<string>, key: string): Set<string> {
		const next = new Set(set);
		if (next.has(key)) {
			next.delete(key);
		} else {
			next.add(key);
		}
		return next;
	}

	function applyUpdate(update: MetricUpdate) {
		groups = groups.map((group) => {
			if (group.id !== update.groupId) return group;
			return {
				...group,
				nodes: group.nodes.map((node) => {
					if (node.id !== update.nodeId) return node;
					if (!update.deviceId) {
						return {
							...node,
							metrics: node.metrics.map((m) =>
								m.id === update.metricId ? { ...m, value: update.value } : m
							)
						};
					}
					return {
						...node,
						devices: node.devices.map((device) => {
							if (device.id !== update.deviceId) return device;
							return {
								...device,
								metrics: device.metrics.map((m) =>
									m.id === update.metricId ? { ...m, value: update.value } : m
								)
							};
						})
					};
				})
			};
		});
	}

	$effect(() => {
		if (error) return;

		const eventSource = new EventSource('/api/subscribe');

		eventSource.onopen = () => {
			connected = true;
		};

		eventSource.addEventListener('metricUpdate', (event) => {
			const updates: MetricUpdate[] = JSON.parse(event.data);
			for (const update of updates) {
				applyUpdate(update);
			}
		});

		eventSource.onerror = () => {
			connected = false;
		};

		return () => {
			eventSource.close();
		};
	});
</script>

<div class="dashboard">
	<div class="status-bar">
		<h2>Live Metrics</h2>
		<div class="connection-status">
			<span class="status-dot" class:connected></span>
			{connected ? 'Connected' : 'Connecting...'}
		</div>
	</div>

	{#if error}
		<div class="error-banner">
			<p>{error}</p>
		</div>
	{/if}

	{#if groups.length === 0 && !error}
		<div class="empty-state">
			<p>No data available. Make sure your space has active Sparkplug nodes publishing data.</p>
		</div>
	{/if}

	{#each groups as group}
		<div class="group-card">
			<button class="group-header" onclick={() => (expandedGroups = toggleSet(expandedGroups, group.id))}>
				{#if expandedGroups.has(group.id)}
					<ChevronDown />
				{:else}
					<ChevronRight />
				{/if}
				<span class="group-name">{group.id}</span>
				<span class="badge">{group.nodes.length} node{group.nodes.length !== 1 ? 's' : ''}</span>
			</button>

			{#if expandedGroups.has(group.id)}
				<div class="group-content">
					{#each group.nodes as node}
						{@const nodeKey = `${group.id}/${node.id}`}
						<div class="node-section">
							<button class="node-header" onclick={() => (expandedNodes = toggleSet(expandedNodes, nodeKey))}>
								{#if expandedNodes.has(nodeKey)}
									<ChevronDown />
								{:else}
									<ChevronRight />
								{/if}
								<span class="node-name">{node.id}</span>
							</button>

							{#if expandedNodes.has(nodeKey)}
								<div class="node-content">
									{#if node.metrics.length > 0}
										<div class="metrics-section">
											<h4>Node Metrics</h4>
											<div class="metrics-grid">
												{#each node.metrics as metric}
													<div class="metric-card">
														<span class="metric-name">{metric.name}</span>
														<span class="metric-value">{metric.value}</span>
														<span class="metric-type">{metric.type}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									{#each node.devices as device}
										{@const deviceKey = `${group.id}/${node.id}/${device.id}`}
										<div class="device-section">
											<button class="device-header" onclick={() => (expandedDevices = toggleSet(expandedDevices, deviceKey))}>
												{#if expandedDevices.has(deviceKey)}
													<ChevronDown />
												{:else}
													<ChevronRight />
												{/if}
												<span class="device-name">{device.id}</span>
											</button>

											{#if expandedDevices.has(deviceKey)}
												<div class="metrics-grid">
													{#each device.metrics as metric}
														<div class="metric-card">
															<span class="metric-name">{metric.name}</span>
															<span class="metric-value">{metric.value}</span>
															<span class="metric-type">{metric.type}</span>
														</div>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style lang="scss">
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: calc(var(--spacing-unit) * 4);
	}

	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;

		h2 {
			margin: 0;
			font-size: var(--text-2xl);
			color: var(--theme-text);
		}
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing-unit) * 2);
		font-size: var(--text-sm);
		color: var(--theme-neutral-600);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--red-500);

		&.connected {
			background: var(--green-500);
		}
	}

	.error-banner {
		padding: calc(var(--spacing-unit) * 4);
		background: var(--theme-error-100);
		border: 1px solid var(--theme-error-300);
		border-radius: var(--rounded-lg);
		color: var(--theme-error-700);

		p {
			margin: 0;
		}
	}

	.empty-state {
		text-align: center;
		padding: calc(var(--spacing-unit) * 12);
		color: var(--theme-neutral-500);
	}

	.group-card {
		background: var(--theme-neutral-50);
		border: 1px solid var(--theme-neutral-300);
		border-radius: var(--rounded-lg);
		overflow: hidden;
	}

	.group-header,
	.node-header,
	.device-header {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing-unit) * 2);
		width: 100%;
		padding: calc(var(--spacing-unit) * 3) calc(var(--spacing-unit) * 4);
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: var(--text-base);
		color: var(--theme-text);
		text-align: left;

		&:hover {
			background: var(--theme-neutral-200);
		}
	}

	.group-header {
		background: var(--theme-neutral-100);
		font-weight: 600;
	}

	.badge {
		margin-left: auto;
		font-size: var(--text-xs);
		padding: calc(var(--spacing-unit) * 0.5) calc(var(--spacing-unit) * 2);
		background: var(--theme-primary);
		color: white;
		border-radius: var(--rounded-full);
		font-weight: 500;
	}

	.group-content {
		padding: calc(var(--spacing-unit) * 2);
	}

	.node-section {
		border: 1px solid var(--theme-neutral-200);
		border-radius: var(--rounded-md);
		margin-bottom: calc(var(--spacing-unit) * 2);
		overflow: hidden;
	}

	.node-content {
		padding: calc(var(--spacing-unit) * 3);
	}

	.metrics-section h4 {
		margin: 0 0 calc(var(--spacing-unit) * 2) 0;
		font-size: var(--text-sm);
		color: var(--theme-neutral-500);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.device-section {
		margin-top: calc(var(--spacing-unit) * 2);
		border: 1px solid var(--theme-neutral-200);
		border-radius: var(--rounded-md);
		overflow: hidden;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: calc(var(--spacing-unit) * 2);
		padding: calc(var(--spacing-unit) * 2);
	}

	.metric-card {
		display: flex;
		flex-direction: column;
		gap: calc(var(--spacing-unit) * 1);
		padding: calc(var(--spacing-unit) * 3);
		background: var(--theme-neutral-100);
		border-radius: var(--rounded-md);
		border: 1px solid var(--theme-neutral-200);
	}

	.metric-name {
		font-size: var(--text-sm);
		color: var(--theme-neutral-600);
		font-weight: 500;
	}

	.metric-value {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--theme-text);
		font-variant-numeric: tabular-nums;
	}

	.metric-type {
		font-size: var(--text-xs);
		color: var(--theme-neutral-400);
	}
</style>
