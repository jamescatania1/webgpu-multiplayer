<script lang="ts">
	import { onMount } from "svelte";
	import Game from "$game/Game";
	import PerformanceStats from "$lib/components/performance-stats.svelte";

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const game = new Game(canvas);
		return () => {
			game.onDestroy();
		};
	});
</script>

<div class="relative flex h-dvh w-dvw items-center justify-center">
	<canvas bind:this={canvas}> </canvas>
	<PerformanceStats />
</div>
