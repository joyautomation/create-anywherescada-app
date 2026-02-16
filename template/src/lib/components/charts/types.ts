// Metric identifier for history API
export type MetricIdentifier = {
	groupId: string;
	nodeId: string;
	deviceId: string;
	metricId: string;
};

// Metric with display info
export type MetricInfo = MetricIdentifier & {
	name: string;
	type: string;
};

// Single data point from history
export type HistoryDataPoint = {
	value: number;
	timestamp: Date;
};

// History response for a single metric
export type MetricHistory = MetricIdentifier & {
	history: HistoryDataPoint[];
};

// Chart mode
export type ChartMode = 'historical' | 'realtime';

// Time range presets for real-time mode
export type TimeRangePreset = '5m' | '15m' | '30m' | '1h' | '6h' | '12h' | '1d' | '1w' | '1M';

// Time range configuration
export type TimeRange = {
	mode: ChartMode;
	start?: Date;
	end?: Date;
	preset?: TimeRangePreset;
};

// Chart series (metric with its data and display properties)
export type ChartSeries = {
	metric: MetricInfo;
	data: HistoryDataPoint[];
	color: string;
	visible: boolean;
};

// Tooltip value with screen position for highlighting
export type TooltipValue = {
	metric: MetricInfo;
	value: number;
	color: string;
	screenX: number;
	screenY: number;
	timestamp: Date;
};

// Tooltip data
export type TooltipData = {
	x: number;
	y: number;
	timestamp: Date;
	values: TooltipValue[];
	containerWidth: number;
};

// Preset durations in milliseconds
export const PRESET_DURATIONS: Record<TimeRangePreset, number> = {
	'5m': 5 * 60 * 1000,
	'15m': 15 * 60 * 1000,
	'30m': 30 * 60 * 1000,
	'1h': 60 * 60 * 1000,
	'6h': 6 * 60 * 60 * 1000,
	'12h': 12 * 60 * 60 * 1000,
	'1d': 24 * 60 * 60 * 1000,
	'1w': 7 * 24 * 60 * 60 * 1000,
	'1M': 30 * 24 * 60 * 60 * 1000
};

// Preset labels for display
export const PRESET_LABELS: Record<TimeRangePreset, string> = {
	'5m': 'Last 5 minutes',
	'15m': 'Last 15 minutes',
	'30m': 'Last 30 minutes',
	'1h': 'Last 1 hour',
	'6h': 'Last 6 hours',
	'12h': 'Last 12 hours',
	'1d': 'Last 1 day',
	'1w': 'Last 1 week',
	'1M': 'Last 1 month'
};

// Real-time mode is limited to max 1 hour for performance
export const REALTIME_PRESETS: TimeRangePreset[] = ['5m', '15m', '30m', '1h'];
