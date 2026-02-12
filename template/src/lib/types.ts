export type SparkplugMetricProperty = {
	id: string;
	type: string;
	value: string;
};

export type SparkplugMetric = {
	id: string;
	name: string;
	value: string;
	type: string;
	scanRate: number;
	properties: SparkplugMetricProperty[];
};

export type SparkplugDevice = {
	id: string;
	metrics: SparkplugMetric[];
};

export type SparkplugNode = {
	id: string;
	metrics: SparkplugMetric[];
	devices: SparkplugDevice[];
};

export type SparkplugGroup = {
	id: string;
	nodes: SparkplugNode[];
};

export type MetricUpdate = {
	groupId: string;
	nodeId: string;
	deviceId: string;
	metricId: string;
	value: string;
	timestamp: number;
};
