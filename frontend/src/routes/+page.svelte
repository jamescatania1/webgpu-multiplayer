<script lang="ts">
	import { onMount } from "svelte";
	import Game from "$game/Game";

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const game = new Game(canvas);

        return () => {
            game.onDestroy();
        }
	});

</script>

<div class="h-dvh w-dvw flex justify-center items-center">
	<canvas bind:this={canvas}> </canvas>
</div>
