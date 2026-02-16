<script lang="ts">
	import '@joyautomation/salt/styles.scss';
	import '../app.scss';
	import { Toast, ThemeSwitch, themeState, type Theme } from '@joyautomation/salt';
	import { onMount } from 'svelte';

	const { data, children } = $props();

	onMount(() => {
		themeState.initialize(data.theme as Theme | null);
	});
</script>

<header>
	<h1>My SCADA App</h1>
	<ThemeSwitch />
</header>

<main>
	{@render children()}
</main>

<Toast />
