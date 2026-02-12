<script lang="ts">
	import '@joyautomation/salt/styles.scss';
	import '../app.scss';
	import { Toast, ThemeButton } from '@joyautomation/salt';

	const { data, children } = $props();
</script>

<header>
	<h1>My SCADA App</h1>
	<ThemeButton theme={data.theme} />
</header>

<main>
	{@render children()}
</main>

<Toast />
