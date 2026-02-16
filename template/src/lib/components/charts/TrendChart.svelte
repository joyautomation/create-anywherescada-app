<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import type {
		MetricInfo,
		ChartSeries,
		TimeRange,
		TooltipData,
		TooltipValue,
		HistoryDataPoint
	} from './types';
	import { PRESET_DURATIONS } from './types';
	import { createColorScale, getMetricKey, isBooleanType } from './utils';
	import TrendChartControls from './TrendChartControls.svelte';
	import TrendChartLegend from './TrendChartLegend.svelte';
	import TrendChartTooltip from './TrendChartTooltip.svelte';

	type Props = {
		availableMetrics: MetricInfo[];
		height?: number;
	};

	let { availableMetrics, height = 350 }: Props = $props();

	// State
	let selectedMetrics = $state<MetricInfo[]>([]);
	let timeRange = $state<TimeRange>({ mode: 'realtime', preset: '15m' });
	let samples = $state(200);
	let raw = $state(false);
	let showDataPoints = $state(false);
	let paused = $state(false);
	let series = $state<ChartSeries[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let tooltipData = $state<TooltipData | null>(null);
	let customColors = $state<Record<string, string>>({});

	// DOM refs
	let containerRef: HTMLDivElement | undefined = $state();
	let svgRef: SVGSVGElement | undefined = $state();
	let containerWidth = $state(800);
	let mounted = $state(false);

	// Real-time tick
	let realtimeTick = $state(Date.now());

	// Chart structure tracking
	let chartInitialized = $state(false);
	let lastSeriesKeys = $state<string>('');

	// Stored scales
	let currentXScale: d3.ScaleTime<number, number> | null = null;
	let currentYScale: d3.ScaleLinear<number, number> | null = null;

	// Y-axis bounds (non-reactive, persist across effect re-runs)
	let yBoundsMin: number | null = null;
	let yBoundsMax: number | null = null;
	let previousMode: 'realtime' | 'historical' = 'realtime';

	let isHovering = $state(false);

	const margin = { top: 20, right: 30, bottom: 30, left: 60 };
	const transitionDuration = 300;
	const MAX_TOTAL_POINTS = 10000;

	function getCSSVar(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	let colorScale = $derived(createColorScale(selectedMetrics));

	function getMetricColor(metricKey: string): string {
		return customColors[metricKey] || colorScale(metricKey);
	}

	function setMetricColor(metric: MetricInfo, color: string) {
		const key = getMetricKey(metric);
		customColors = { ...customColors, [key]: color };
		series = series.map((s) => {
			if (getMetricKey(s.metric) === key) return { ...s, color };
			return s;
		});
	}

	let booleanSeries = $derived(series.filter((s) => isBooleanType(s.metric.type)));
	let numericSeries = $derived(series.filter((s) => !isBooleanType(s.metric.type)));

	const BOOLEAN_STRIP_HEIGHT = 20;
	const BOOLEAN_STRIP_GAP = 6;
	const BOOLEAN_AREA_PADDING = 24;
	let booleanAreaHeight = $derived(
		booleanSeries.length > 0
			? booleanSeries.length * BOOLEAN_STRIP_HEIGHT +
				(booleanSeries.length - 1) * BOOLEAN_STRIP_GAP +
				BOOLEAN_AREA_PADDING
			: 0
	);

	let totalPoints = $derived(series.reduce((sum, s) => sum + s.data.length, 0));
	let tooManyPoints = $derived(totalPoints > MAX_TOTAL_POINTS);

	let timeBounds = $derived.by(() => {
		if (timeRange.mode === 'historical' && timeRange.start && timeRange.end) {
			return { start: timeRange.start, end: timeRange.end };
		}
		const now = new Date(realtimeTick);
		const preset = timeRange.preset || '15m';
		const start = new Date(now.getTime() - PRESET_DURATIONS[preset]);
		return { start, end: now };
	});

	function getFetchTimeBounds() {
		if (timeRange.mode === 'historical' && timeRange.start && timeRange.end) {
			return { start: timeRange.start, end: timeRange.end };
		}
		const now = new Date();
		const preset = timeRange.preset || '15m';
		const start = new Date(now.getTime() - PRESET_DURATIONS[preset]);
		return { start, end: now };
	}

	async function fetchHistory() {
		if (selectedMetrics.length === 0) {
			series = [];
			return;
		}

		loading = true;
		error = null;
		const fetchBounds = getFetchTimeBounds();

		try {
			const response = await fetch('/api/history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start: fetchBounds.start.toISOString(),
					end: fetchBounds.end.toISOString(),
					metrics: selectedMetrics.map((m) => ({
						groupId: m.groupId,
						nodeId: m.nodeId,
						deviceId: m.deviceId,
						metricId: m.metricId
					})),
					samples,
					raw
				})
			});

			if (!response.ok) {
				const err = await response.json();
				throw new Error(err.error || 'Failed to fetch history');
			}

			const historyData = await response.json();

			series = selectedMetrics.map((metric) => {
				const key = getMetricKey(metric);
				const existingSeries = series.find((s) => getMetricKey(s.metric) === key);
				let historyItem = historyData.find(
					(h: { groupId: string; nodeId: string; deviceId: string; metricId: string }) =>
						h.groupId === metric.groupId &&
						h.nodeId === metric.nodeId &&
						h.deviceId === metric.deviceId &&
						h.metricId === metric.metricId
				);
				if (!historyItem) {
					historyItem = historyData.find(
						(h: { metricId: string }) => h.metricId === metric.metricId
					);
				}

				const points: HistoryDataPoint[] = (historyItem?.history || [])
					.map((p: { value: string; timestamp: string }) => {
						let value: number;
						const lowerValue = String(p.value).toLowerCase();
						if (lowerValue === 'true') value = 1;
						else if (lowerValue === 'false') value = 0;
						else value = parseFloat(p.value);
						return { value, timestamp: new Date(p.timestamp) };
					})
					.filter((p: HistoryDataPoint) => !isNaN(p.value))
					.sort(
						(a: HistoryDataPoint, b: HistoryDataPoint) =>
							a.timestamp.getTime() - b.timestamp.getTime()
					);

				return {
					metric,
					data: points,
					color: getMetricColor(key),
					visible: existingSeries?.visible ?? true
				};
			});
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
			series = [];
		} finally {
			loading = false;
		}
	}

	function getSeriesKeys(): string {
		return (
			`${booleanAreaHeight}|` +
			series
				.map((s) => `${getMetricKey(s.metric)}:${s.visible}`)
				.sort()
				.join('|')
		);
	}

	function initializeChart() {
		if (!svgRef || !mounted) return;

		const svg = d3.select(svgRef);
		svg.selectAll('*').remove();

		const width = containerWidth;
		const innerWidth = width - margin.left - margin.right;
		const chartBottom = margin.bottom + booleanAreaHeight;
		const innerHeight = height - margin.top - chartBottom;

		if (innerWidth <= 0 || innerHeight <= 0) return;

		const visibleNumericSeries = numericSeries.filter((s) => s.visible);
		const visibleBooleanSeries = booleanSeries.filter((s) => s.visible);
		const allNumericPoints = visibleNumericSeries.flatMap((s) => s.data);

		if (allNumericPoints.length === 0 && visibleBooleanSeries.length === 0) {
			svg
				.append('text')
				.attr('class', 'empty-text')
				.attr('x', width / 2)
				.attr('y', height / 2)
				.attr('text-anchor', 'middle')
				.attr('fill', getCSSVar('--theme-neutral-500'))
				.attr('font-size', '14px')
				.text(selectedMetrics.length === 0 ? 'Select metrics to display' : 'No data available');
			currentXScale = null;
			currentYScale = null;
			chartInitialized = false;
			return;
		}

		svg.append('defs')
			.append('clipPath')
			.attr('id', 'chart-clip')
			.append('rect')
			.attr('x', margin.left)
			.attr('y', margin.top)
			.attr('width', innerWidth)
			.attr('height', innerHeight);

		svg.select('defs')
			.append('clipPath')
			.attr('id', 'boolean-clip')
			.append('rect')
			.attr('x', margin.left)
			.attr('y', height - margin.bottom - booleanAreaHeight)
			.attr('width', innerWidth)
			.attr('height', booleanAreaHeight);

		svg.append('g')
			.attr('class', 'grid')
			.attr('transform', `translate(${margin.left},0)`);

		svg.append('g')
			.attr('class', 'x-axis')
			.attr('transform', `translate(0,${height - chartBottom})`);

		svg.append('g')
			.attr('class', 'y-axis')
			.attr('transform', `translate(${margin.left},0)`);

		const linesGroup = svg
			.append('g')
			.attr('class', 'lines-group')
			.attr('clip-path', 'url(#chart-clip)');

		visibleNumericSeries.forEach((s) => {
			const safeKey = getMetricKey(s.metric).replace(/[^a-zA-Z0-9]/g, '-');
			linesGroup
				.append('path')
				.attr('class', `line line-${safeKey}`)
				.attr('fill', 'none')
				.attr('stroke', s.color)
				.attr('stroke-width', 2);
		});

		svg.append('g').attr('class', 'boolean-strips-group');
		svg.append('g').attr('class', 'points-group').attr('clip-path', 'url(#chart-clip)');
		svg.append('g').attr('class', 'highlight-group').attr('clip-path', 'url(#chart-clip)');

		svg.append('line')
			.attr('class', 'tooltip-line')
			.attr('stroke', getCSSVar('--theme-neutral-500') || '#888')
			.attr('stroke-width', 1)
			.attr('stroke-dasharray', '3,3')
			.attr('x1', margin.left)
			.attr('x2', margin.left)
			.attr('y1', margin.top)
			.attr('y2', height - margin.bottom)
			.style('display', 'none');

		svg.append('rect')
			.attr('class', 'overlay')
			.attr('fill', 'none')
			.attr('pointer-events', 'all')
			.attr('x', margin.left)
			.attr('y', margin.top)
			.attr('width', innerWidth)
			.attr('height', innerHeight + booleanAreaHeight);

		chartInitialized = true;
		lastSeriesKeys = getSeriesKeys();
		updateChart();
	}

	function updateChart() {
		if (!svgRef || !mounted || !chartInitialized) return;
		if (tooManyPoints) return;

		const svg = d3.select(svgRef);
		const width = containerWidth;
		const innerWidth = width - margin.left - margin.right;
		const chartBottom = margin.bottom + booleanAreaHeight;
		const innerHeight = height - margin.top - chartBottom;

		if (innerWidth <= 0 || innerHeight <= 0) return;

		const visibleNumericSeries = numericSeries.filter((s) => s.visible);
		const visibleBooleanSeries = booleanSeries.filter((s) => s.visible);
		const allNumericPoints = visibleNumericSeries.flatMap((s) => s.data);

		if (allNumericPoints.length === 0 && visibleBooleanSeries.length === 0) return;

		// Scales
		const xScale = d3
			.scaleTime()
			.domain([timeBounds.start, timeBounds.end])
			.range([margin.left, width - margin.right]);

		let yScale: d3.ScaleLinear<number, number>;
		if (allNumericPoints.length > 0) {
			const yExtent = d3.extent(allNumericPoints, (d) => d.value) as [number, number];
			const yPadding = (yExtent[1] - yExtent[0]) * 0.1 || 1;
			const dataMin = yExtent[0] - yPadding;
			const dataMax = yExtent[1] + yPadding;

			let yMin: number, yMax: number;
			if (timeRange.mode === 'realtime') {
				yMin = yBoundsMin === null ? dataMin : Math.min(yBoundsMin, dataMin);
				yMax = yBoundsMax === null ? dataMax : Math.max(yBoundsMax, dataMax);
				yBoundsMin = yMin;
				yBoundsMax = yMax;
			} else {
				yMin = dataMin;
				yMax = dataMax;
			}

			yScale = d3
				.scaleLinear()
				.domain([yMin, yMax])
				.range([height - chartBottom, margin.top]);
		} else {
			yScale = d3
				.scaleLinear()
				.domain([0, 1])
				.range([height - chartBottom, margin.top]);
		}

		currentXScale = xScale;
		currentYScale = yScale;

		const t = svg.transition().duration(transitionDuration).ease(d3.easeLinear);

		// Grid
		const gridColor = getCSSVar('--theme-neutral-300') || '#e5e5e5';
		svg
			.select<SVGGElement>('.grid')
			.transition(t as any)
			.call(
				d3
					.axisLeft(yScale)
					.tickSize(-innerWidth)
					.tickFormat(() => '') as any
			)
			.call((g) => g.select('.domain').remove())
			.call((g) =>
				g.selectAll('.tick line').attr('stroke', gridColor).attr('stroke-opacity', 0.3)
			);

		// Axes
		const textColor = getCSSVar('--theme-text') || '#333';
		const axisColor = getCSSVar('--theme-neutral-400') || '#9ca3af';

		const xAxis = d3.axisBottom(xScale).ticks(6);
		svg
			.select<SVGGElement>('.x-axis')
			.transition(t as any)
			.call(xAxis as any)
			.call((g) => g.select('.domain').attr('stroke', axisColor))
			.call((g) => g.selectAll('.tick line').attr('stroke', axisColor))
			.call((g) =>
				g
					.selectAll('.tick text')
					.attr('fill', textColor)
					.attr('font-size', '12px')
					.attr('font-weight', '500')
			);

		const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('.2f'));
		svg
			.select<SVGGElement>('.y-axis')
			.transition(t as any)
			.call(yAxis as any)
			.call((g) => g.select('.domain').attr('stroke', axisColor))
			.call((g) => g.selectAll('.tick line').attr('stroke', axisColor))
			.call((g) => g.selectAll('.tick text').attr('fill', textColor).attr('font-size', '11px'));

		// Lines
		visibleNumericSeries.forEach((s) => {
			const safeKey = getMetricKey(s.metric).replace(/[^a-zA-Z0-9]/g, '-');
			const data = s.data;

			const lineGenerator = d3
				.line<HistoryDataPoint>()
				.x((d) => xScale(d.timestamp))
				.y((d) => yScale(d.value))
				.curve(d3.curveMonotoneX);

			svg
				.select(`.line-${safeKey}`)
				.datum(data)
				.attr('d', lineGenerator)
				.attr('stroke', s.color);
		});

		// Boolean strips
		const booleanStripsGroup = svg.select('.boolean-strips-group');
		const neutralColor = getCSSVar('--theme-neutral-700') || '#374151';
		const booleanStripY = height - chartBottom + BOOLEAN_AREA_PADDING;

		booleanStripsGroup.selectAll('*').remove();

		visibleBooleanSeries.forEach((s, index) => {
			const stripY = booleanStripY + index * (BOOLEAN_STRIP_HEIGHT + BOOLEAN_STRIP_GAP);
			const data = s.data;

			if (data.length === 0) return;

			type Segment = { startTime: Date; endTime: Date; isTrue: boolean };
			const segments: Segment[] = [];

			for (let i = 0; i < data.length; i++) {
				const point = data[i];
				const nextPoint = data[i + 1];
				const isTrue = point.value === 1 || point.value > 0;

				const startTime = i === 0 ? timeBounds.start : point.timestamp;
				const endTime = nextPoint ? nextPoint.timestamp : timeBounds.end;

				const lastSegment = segments[segments.length - 1];
				if (lastSegment && lastSegment.isTrue === isTrue) {
					lastSegment.endTime = endTime;
				} else {
					segments.push({ startTime, endTime, isTrue });
				}
			}

			for (const segment of segments) {
				const x1 = xScale(segment.startTime);
				const x2 = xScale(segment.endTime);

				if (x2 < margin.left || x1 > width - margin.right) continue;

				const clampedX1 = Math.max(x1, margin.left);
				const clampedX2 = Math.min(x2, width - margin.right);
				const rectWidth = clampedX2 - clampedX1;

				if (rectWidth > 0) {
					booleanStripsGroup
						.append('rect')
						.attr('x', clampedX1)
						.attr('y', stripY)
						.attr('width', rectWidth)
						.attr('height', BOOLEAN_STRIP_HEIGHT)
						.attr('fill', segment.isTrue ? s.color : neutralColor)
						.attr('stroke', s.color)
						.attr('stroke-width', 1.5)
						.attr('opacity', segment.isTrue ? 1 : 0.5);
				}
			}

			booleanStripsGroup
				.append('text')
				.attr('x', margin.left + 6)
				.attr('y', stripY + BOOLEAN_STRIP_HEIGHT / 2)
				.attr('text-anchor', 'start')
				.attr('dominant-baseline', 'middle')
				.attr('fill', 'white')
				.attr('font-size', '10px')
				.attr('font-weight', '500')
				.text(s.metric.name);
		});

		// Data points
		const pointsGroup = svg.select('.points-group');

		if (showDataPoints) {
			visibleNumericSeries.forEach((s) => {
				const safeKey = getMetricKey(s.metric).replace(/[^a-zA-Z0-9]/g, '-');

				const points = pointsGroup
					.selectAll<SVGCircleElement, HistoryDataPoint>(`.point-${safeKey}`)
					.data(s.data, (d: HistoryDataPoint) => d.timestamp.getTime().toString());

				points
					.enter()
					.append('circle')
					.attr('class', `data-point point-${safeKey}`)
					.attr('cx', (d) => xScale(d.timestamp))
					.attr('cy', (d) => yScale(d.value))
					.attr('r', 3)
					.attr('fill', 'white')
					.attr('stroke', s.color)
					.attr('stroke-width', 1.5);

				points
					.transition(t as any)
					.attr('cx', (d) => xScale(d.timestamp))
					.attr('cy', (d) => yScale(d.value))
					.attr('stroke', s.color);

				points.exit().remove();
			});
		} else {
			pointsGroup.selectAll('.data-point').remove();
		}

		// Mouse events
		const bisect = d3.bisector<HistoryDataPoint, Date>((d) => d.timestamp).left;
		const highlightGroup = svg.select('.highlight-group');
		const tooltipLine = svg.select('.tooltip-line');

		svg
			.select('.overlay')
			.on('mouseenter', () => {
				isHovering = true;
			})
			.on('mousemove', (event) => {
				isHovering = true;
				const [mx] = d3.pointer(event);
				const x0 = xScale.invert(mx);

				const values: TooltipValue[] = visibleNumericSeries
					.map((s) => {
						if (s.data.length === 0) return null;
						const i = bisect(s.data, x0);
						const d0 = s.data[i - 1];
						const d1 = s.data[i];
						if (!d0 && !d1) return null;
						const d = !d0
							? d1
							: !d1
								? d0
								: x0.getTime() - d0.timestamp.getTime() >
									  d1.timestamp.getTime() - x0.getTime()
									? d1
									: d0;
						return {
							metric: s.metric,
							value: d.value,
							color: s.color,
							screenX: xScale(d.timestamp),
							screenY: yScale(d.value),
							timestamp: d.timestamp
						};
					})
					.filter((v): v is TooltipValue => v !== null);

				const booleanValues: TooltipValue[] = visibleBooleanSeries
					.map((s, index) => {
						if (s.data.length === 0) return null;
						const i = bisect(s.data, x0);
						const d0 = s.data[i - 1];
						const d1 = s.data[i];
						if (!d0 && !d1) return null;
						const d = !d0
							? d1
							: !d1
								? d0
								: x0.getTime() - d0.timestamp.getTime() >
									  d1.timestamp.getTime() - x0.getTime()
									? d1
									: d0;
						const sY =
							booleanStripY +
							index * (BOOLEAN_STRIP_HEIGHT + BOOLEAN_STRIP_GAP) +
							BOOLEAN_STRIP_HEIGHT / 2;
						return {
							metric: s.metric,
							value: d.value,
							color: s.color,
							screenX: xScale(d.timestamp),
							screenY: sY,
							timestamp: d.timestamp
						};
					})
					.filter((v): v is TooltipValue => v !== null);

				const allValues = [...values, ...booleanValues];

				if (allValues.length > 0) {
					tooltipData = {
						x: mx,
						y: event.offsetY,
						timestamp: allValues[0].timestamp,
						values: allValues,
						containerWidth
					};

					tooltipLine.attr('x1', mx).attr('x2', mx).style('display', null);

					highlightGroup.selectAll('circle').remove();
					values.forEach((v) => {
						highlightGroup
							.append('circle')
							.attr('cx', v.screenX)
							.attr('cy', v.screenY)
							.attr('r', 6)
							.attr('fill', v.color)
							.attr('stroke', 'white')
							.attr('stroke-width', 2)
							.style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))');
					});
				}
			})
			.on('mouseleave', () => {
				isHovering = false;
				tooltipData = null;
				tooltipLine.style('display', 'none');
				highlightGroup.selectAll('circle').remove();
			});

		// Restore highlights if hovering during update
		if (isHovering && tooltipData && tooltipData.values.length > 0 && tooltipData.timestamp) {
			const newX = xScale(tooltipData.timestamp);
			if (!isNaN(newX) && newX >= margin.left && newX <= width - margin.right) {
				tooltipLine.attr('x1', newX).attr('x2', newX).style('display', null);

				highlightGroup.selectAll('circle').remove();
				tooltipData.values.forEach((v) => {
					const screenX = xScale(v.timestamp);
					const screenY = yScale(v.value);
					if (!isNaN(screenX) && !isNaN(screenY)) {
						highlightGroup
							.append('circle')
							.attr('cx', screenX)
							.attr('cy', screenY)
							.attr('r', 6)
							.attr('fill', v.color)
							.attr('stroke', 'white')
							.attr('stroke-width', 2)
							.style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))');
					}
				});
			} else {
				tooltipLine.style('display', 'none');
				highlightGroup.selectAll('circle').remove();
			}
		}
	}

	function renderChart() {
		if (!svgRef || !mounted) return;
		const currentKeys = getSeriesKeys();
		const structureChanged = currentKeys !== lastSeriesKeys || !chartInitialized;
		if (structureChanged) initializeChart();
		else updateChart();
	}

	function addMetric(metric: MetricInfo) {
		if (!selectedMetrics.some((m) => getMetricKey(m) === getMetricKey(metric))) {
			selectedMetrics = [...selectedMetrics, metric];
			resetYBounds();
		}
	}

	function removeMetric(metric: MetricInfo) {
		selectedMetrics = selectedMetrics.filter(
			(m) => getMetricKey(m) !== getMetricKey(metric)
		);
		resetYBounds();
	}

	function toggleVisibility(metric: MetricInfo) {
		series = series.map((s) =>
			getMetricKey(s.metric) === getMetricKey(metric) ? { ...s, visible: !s.visible } : s
		);
	}

	function handleModeChange() {
		if (timeRange.mode === 'realtime') {
			const now = new Date();
			const start = new Date(now.getTime() - 60 * 60 * 1000);
			timeRange = { mode: 'historical', start, end: now };
		} else {
			raw = false;
			timeRange = { mode: 'realtime', preset: '15m' };
		}
	}

	function resetYBounds() {
		yBoundsMin = null;
		yBoundsMax = null;
	}

	// SSE for real-time updates
	let eventSource: EventSource | null = null;

	function connectSSE() {
		if (eventSource) eventSource.close();
		if (selectedMetrics.length === 0 || timeRange.mode !== 'realtime') return;

		eventSource = new EventSource('/api/subscribe');

		eventSource.addEventListener('metricUpdate', (event) => {
			if (paused) return;
			try {
				const data = JSON.parse(event.data);
				const updates = Array.isArray(data) ? data : [data];

				const preset = timeRange.preset || '15m';
				const visibleDuration = PRESET_DURATIONS[preset];
				const cutoffTime = Date.now() - visibleDuration * 2;

				series = series.map((s) => {
					const matching = updates.filter(
						(m: {
							groupId: string;
							nodeId: string;
							deviceId: string;
							metricId: string;
						}) =>
							m.groupId === s.metric.groupId &&
							m.nodeId === s.metric.nodeId &&
							m.deviceId === s.metric.deviceId &&
							m.metricId === s.metric.metricId
					);

					if (matching.length > 0) {
						let newData = s.data.filter((p) => p.timestamp.getTime() > cutoffTime);
						let added = 0;

						for (const m of matching) {
							let value: number;
							const lowerValue = String(m.value).toLowerCase();
							if (lowerValue === 'true') value = 1;
							else if (lowerValue === 'false') value = 0;
							else value = parseFloat(m.value);
							if (isNaN(value)) continue;

							const timestamp = new Date(m.timestamp);
							if (!newData.find((p) => p.timestamp.getTime() === timestamp.getTime())) {
								newData.push({ value, timestamp });
								added++;
							}
						}

						if (added > 0 || newData.length !== s.data.length) {
							newData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
							return { ...s, data: newData };
						}
					}
					return s;
				});
			} catch {
				// Ignore parse errors
			}
		});
	}

	// Effects
	onMount(() => {
		mounted = true;

		if (containerRef) {
			const observer = new ResizeObserver((entries) => {
				containerWidth = entries[0].contentRect.width;
				chartInitialized = false;
			});
			observer.observe(containerRef);
			return () => {
				observer.disconnect();
				if (eventSource) eventSource.close();
			};
		}

		return () => {
			if (eventSource) eventSource.close();
		};
	});

	// Reset Y bounds on mode change
	$effect(() => {
		const currentMode = timeRange.mode;
		if (currentMode !== previousMode) {
			previousMode = currentMode;
			resetYBounds();
		}
	});

	// Fetch data on settings change
	$effect(() => {
		if (!mounted) return;
		const _ = [
			selectedMetrics,
			timeRange.mode,
			timeRange.preset,
			timeRange.start,
			timeRange.end,
			samples,
			raw
		];
		fetchHistory();
	});

	// Render chart on data/dimension changes
	$effect(() => {
		if (!mounted) return;
		const _ = [series, containerWidth, height, showDataPoints, booleanAreaHeight];
		renderChart();
	});

	// Update chart on time tick
	$effect(() => {
		if (!mounted || !chartInitialized) return;
		const _ = [timeBounds];
		updateChart();
	});

	// SSE connection
	$effect(() => {
		if (!mounted) return;
		const _ = [timeRange.mode, selectedMetrics];

		if (timeRange.mode === 'realtime' && selectedMetrics.length > 0) {
			connectSSE();
		} else if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		return () => {
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
		};
	});

	// Real-time tick
	$effect(() => {
		if (timeRange.mode !== 'realtime' || !mounted || paused) return;

		const interval = setInterval(() => {
			realtimeTick = Date.now();
		}, 1000);

		return () => clearInterval(interval);
	});
</script>

<div class="trend-chart-card">
	<div class="card-header">
		<h3 class="card-title">Trend Chart</h3>
		<label class="mode-toggle">
			<input
				type="checkbox"
				checked={timeRange.mode === 'realtime'}
				onchange={handleModeChange}
			/>
			<span class="mode-toggle__slider"></span>
			<span class="mode-toggle__label">
				{timeRange.mode === 'realtime' ? 'Real-time' : 'Historical'}
			</span>
		</label>
	</div>
	<div class="card-body">
		<TrendChartControls
			{availableMetrics}
			{selectedMetrics}
			bind:timeRange
			bind:samples
			bind:raw
			bind:showDataPoints
			bind:paused
			onAddMetric={addMetric}
		/>

		<div class="chart-container" bind:this={containerRef}>
			{#if loading && series.length === 0}
				<div class="chart-loading">Loading...</div>
			{/if}

			<svg bind:this={svgRef} width={containerWidth} {height}></svg>

			{#if tooltipData}
				<TrendChartTooltip data={tooltipData} />
			{/if}
		</div>

		{#if series.length > 0}
			<TrendChartLegend
				{series}
				onToggleVisibility={toggleVisibility}
				onRemoveMetric={removeMetric}
				onColorChange={setMetricColor}
			/>
		{/if}

		{#if tooManyPoints}
			<div class="chart-warning">
				Too many data points ({totalPoints.toLocaleString()}) to render. Try reducing the time
				range, lowering the samples setting, or disabling raw mode.
			</div>
		{/if}

		{#if error}
			<div class="chart-error">{error}</div>
		{/if}
	</div>
</div>

<style lang="scss">
	.trend-chart-card {
		width: 100%;
		min-width: 0;
		border: 1px solid var(--theme-neutral-300);
		border-radius: var(--rounded-md);
		background-color: var(--theme-neutral-50);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--spacing-unit) * 2);
		padding: calc(var(--spacing-unit) * 2) calc(var(--spacing-unit) * 3);
		border-bottom: 1px solid var(--theme-neutral-300);
		background-color: var(--theme-neutral-100);
	}

	.card-title {
		margin: 0;
		color: var(--theme-primary);
		font-size: 1rem;
		font-weight: 600;
	}

	.mode-toggle {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing-unit) * 2);
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--theme-text);
		user-select: none;

		input[type='checkbox'] {
			position: absolute;
			opacity: 0;
			width: 0;
			height: 0;
		}

		&:has(input:checked) .mode-toggle__slider {
			background-color: var(--theme-primary);

			&::before {
				transform: translateX(16px);
			}
		}
	}

	.mode-toggle__slider {
		position: relative;
		width: 36px;
		height: 20px;
		background-color: var(--theme-neutral-400);
		border-radius: 10px;
		transition: background-color 0.2s ease;
		flex-shrink: 0;

		&::before {
			content: '';
			position: absolute;
			top: 2px;
			left: 2px;
			width: 16px;
			height: 16px;
			background-color: white;
			border-radius: 50%;
			transition: transform 0.2s ease;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		}
	}

	.mode-toggle__label {
		min-width: 5.5em;
	}

	.card-body {
		padding: calc(var(--spacing-unit) * 3);
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.chart-container {
		position: relative;
		width: 100%;
		background-color: var(--theme-neutral-100);
		border: 1px solid var(--theme-neutral-200);
		border-radius: var(--rounded-sm, 4px);
		overflow: hidden;
	}

	.chart-loading {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--theme-neutral-500);
		font-size: 14px;
	}

	.chart-error {
		margin-top: calc(var(--spacing-unit) * 2);
		padding: calc(var(--spacing-unit) * 2);
		background-color: rgba(239, 68, 68, 0.1);
		color: #dc2626;
		border-radius: var(--rounded-md);
		font-size: 14px;
	}

	.chart-warning {
		margin-top: calc(var(--spacing-unit) * 2);
		padding: calc(var(--spacing-unit) * 2);
		background-color: #fef3c7;
		color: #b45309;
		border-radius: var(--rounded-md);
		font-size: 14px;
	}

	:global(.trend-chart-card svg) {
		display: block;
	}

	:global(.trend-chart-card .data-point) {
		transition: r 0.15s ease;
	}

	:global(.trend-chart-card .data-point:hover) {
		r: 5;
	}

	:global(.trend-chart-card .tooltip-line) {
		pointer-events: none;
	}

	:global(.trend-chart-card .grid line) {
		stroke: var(--theme-neutral-300);
		stroke-opacity: 0.3;
	}

	:global(.trend-chart-card .grid .domain) {
		display: none !important;
	}

	:global(.trend-chart-card .x-axis line),
	:global(.trend-chart-card .y-axis line) {
		stroke: var(--theme-neutral-400);
	}

	:global(.trend-chart-card .x-axis text),
	:global(.trend-chart-card .y-axis text) {
		fill: var(--theme-text);
	}
</style>
