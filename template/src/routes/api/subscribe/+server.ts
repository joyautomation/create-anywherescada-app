import type { RequestHandler } from './$types';
import { ANYWHERESCADA_API_KEY } from '$env/static/private';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { SUBSCRIPTIONS } from '$lib/anywherescada';

export const GET: RequestHandler = () => {
	if (!ANYWHERESCADA_API_KEY) {
		return new Response('API key not configured', { status: 500 });
	}

	let cleanup: (() => void) | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const client = createClient({
				url: `wss://api.anywherescada.com/graphql?token=${ANYWHERESCADA_API_KEY}`,
				webSocketImpl: WebSocket
			});

			const unsubscribe = client.subscribe(
				{ query: SUBSCRIPTIONS.metricUpdate },
				{
					next: (result) => {
						if (result.data?.metricUpdate) {
							const data = `event: metricUpdate\ndata: ${JSON.stringify(result.data.metricUpdate)}\n\n`;
							controller.enqueue(encoder.encode(data));
						}
					},
					error: (err) => {
						console.error('Subscription error:', err);
						try {
							controller.close();
						} catch {
							// Already closed
						}
					},
					complete: () => {
						try {
							controller.close();
						} catch {
							// Already closed
						}
					}
				}
			);

			cleanup = () => {
				unsubscribe();
				client.dispose();
			};
		},
		cancel() {
			cleanup?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
