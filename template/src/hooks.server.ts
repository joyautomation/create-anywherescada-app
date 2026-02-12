import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const theme = event.cookies.get('theme') ?? 'themeLight';
	const validThemes = ['themeLight', 'themeDark'];
	const safeTheme = validThemes.includes(theme) ? theme : 'themeLight';

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%theme%', safeTheme)
	});
};
