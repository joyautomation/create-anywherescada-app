import type { PageServerLoad } from './$types';
import { ANYWHERESCADA_API_KEY } from '$env/static/private';
import { query, QUERIES } from '$lib/anywherescada';
import type { SparkplugGroup } from '$lib/types';

export const load: PageServerLoad = async () => {
	if (!ANYWHERESCADA_API_KEY) {
		return { groups: [], error: 'ANYWHERESCADA_API_KEY is not set. Add it to your .env file.' };
	}

	try {
		const data = await query<{ groups: SparkplugGroup[] }>(ANYWHERESCADA_API_KEY, QUERIES.groups);
		return { groups: data.groups, error: null };
	} catch (err) {
		return { groups: [], error: err instanceof Error ? err.message : 'Failed to fetch data' };
	}
};
