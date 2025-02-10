<script lang="ts">
	import { onMount } from "svelte";
	import Game from "$game/Game";
	import { gameStats } from "$lib/stores.svelte";

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
	<div
		class="bg-background text-foreground absolute left-0 top-0 flex h-fit w-56 gap-1 flex-col items-start justify-center rounded bg-opacity-50 p-2 text-left text-base font-normal shadow-sm"
	>
		<span>FPS: {Math.round(gameStats.fps)}</span>
		{#each Object.entries(gameStats.passes) as [pass, time]}
			<span>{pass}: {time.toFixed(2)} ms</span>
		{/each}
	</div>
</div>
