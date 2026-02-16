import { json } from '@sveltejs/kit';
import { ANYWHERESCADA_API_KEY } from '$env/static/private';
import { query, QUERIES } from '$lib/anywherescada';
import type { RequestHandler } from './$types';

type HistoryMetricEntry = {
	groupId: string;
	nodeId: string;
	deviceId: string;
	metricId: string;
};

type HistoryResponse = {
	history: Array<{
		groupId: string;
		nodeId: string;
		deviceId: string;
		metricId: string;
		history: Array<{ value: number; timestamp: string }>;
	}>;
};

export const POST: RequestHandler = async ({ request }) => {
	if (!ANYWHERESCADA_API_KEY) {
		return json({ error: 'API key not configured' }, { status: 500 });
	}

	const body = (await request.json()) as {
		start: string;
		end: string;
		metrics: HistoryMetricEntry[];
		interval?: string;
		samples?: number;
		raw?: boolean;
	};

	try {
		const result = await query<HistoryResponse>(ANYWHERESCADA_API_KEY, QUERIES.history, {
			start: body.start,
			end: body.end,
			metrics: body.metrics,
			interval: body.interval,
			samples: body.samples,
			raw: body.raw
		});

		return json(result.history);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
