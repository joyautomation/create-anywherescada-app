<script lang="ts">
	import type { TooltipData } from './types';
	import { formatTimestamp, formatValue } from './utils';

	type Props = {
		data: TooltipData;
	};

	let { data }: Props = $props();

	const TOOLTIP_WIDTH = 200;

	let tooltipStyle = $derived(() => {
		const offsetX = 15;
		const offsetY = -10;

		const wouldOverflowRight = data.x + offsetX + TOOLTIP_WIDTH > data.containerWidth;

		if (wouldOverflowRight) {
			return `left: ${data.x - offsetX - TOOLTIP_WIDTH}px; top: ${data.y + offsetY}px;`;
		}

		return `left: ${data.x + offsetX}px; top: ${data.y + offsetY}px;`;
	});
</script>

<div class="tooltip" style={tooltipStyle()}>
	<div class="tooltip-timestamp">{formatTimestamp(data.timestamp)}</div>
	<div class="tooltip-values">
		{#each data.values as v}
			<div class="tooltip-row">
				<span class="tooltip-color" style:background-color={v.color}></span>
				<span class="tooltip-metric">{v.metric.name}:</span>
				<span class="tooltip-value">
					{#if v.metric.type.toLowerCase().startsWith('bool') || v.metric.type === '11'}
						{v.value === 1 || v.value > 0 ? 'true' : 'false'}
					{:else}
						{formatValue(v.value)}
					{/if}
				</span>
			</div>
		{/each}
	</div>
</div>

<style lang="scss">
	.tooltip {
		position: absolute;
		pointer-events: none;
		background-color: var(--theme-neutral-900);
		color: var(--theme-neutral-100);
		padding: calc(var(--spacing-unit) * 1.5) calc(var(--spacing-unit) * 2);
		border-radius: var(--rounded-md);
		font-size: 0.75rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 100;
		min-width: 150px;
		max-width: 300px;
	}

	.tooltip-timestamp {
		color: var(--theme-neutral-400);
		margin-bottom: calc(var(--spacing-unit) * 1);
		padding-bottom: calc(var(--spacing-unit) * 1);
		border-bottom: 1px solid var(--theme-neutral-700);
		font-family: monospace;
	}

	.tooltip-values {
		display: flex;
		flex-direction: column;
		gap: calc(var(--spacing-unit) * 0.5);
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing-unit) * 1);
	}

	.tooltip-color {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.tooltip-metric {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tooltip-value {
		font-family: monospace;
		font-weight: 500;
	}
</style>
