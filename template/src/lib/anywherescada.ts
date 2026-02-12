const API_URL = 'https://api.anywherescada.com/graphql';

export async function query<T>(
	apiKey: string,
	gql: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const response = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({ query: gql, variables })
	});

	if (!response.ok) {
		throw new Error(`API request failed: ${response.status} ${response.statusText}`);
	}

	const json = await response.json();
	if (json.errors) {
		throw new Error(
			`GraphQL errors: ${json.errors.map((e: { message: string }) => e.message).join(', ')}`
		);
	}

	return json.data;
}

export const QUERIES = {
	groups: `
		query GetGroups {
			groups {
				id
				nodes {
					id
					metrics { id name value type scanRate }
					devices {
						id
						metrics { id name value type scanRate }
					}
				}
			}
		}
	`
};

export const SUBSCRIPTIONS = {
	metricUpdate: `
		subscription {
			metricUpdate {
				groupId
				nodeId
				deviceId
				metricId
				value
				timestamp
			}
		}
	`
};
