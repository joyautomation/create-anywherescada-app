import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => {
	return {
		theme: cookies.get('theme') ?? 'themeLight'
	};
};
