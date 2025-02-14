<script lang="ts">
	import "chartist/dist/index.css";
	import { gameStats } from "$lib/stores.svelte";
	import { PieChart, type PieChartData, getMetaData } from "chartist";
	import { onDestroy, onMount } from "svelte";

	let chart = $state<PieChart>();

	let data = $derived<PieChartData>({
		labels: Object.keys(gameStats.passes),
		series: Object.values(gameStats.passes),
	});
	const colors = [
		"hsl(60,100%,50%)",
		"hsl(240,100%,50%)",
		"hsl(330,100%,50%)",
		"hsl(120,100%,50%)",
		"hsl(180,100%,50%)",
		"hsl(210,100%,50%)",
		"hsl(270,100%,50%)",
		"hsl(90,100%,50%)",
		"hsl(300,100%,50%)",
		"hsl(150,100%,50%)",
	];

	let graphicsTime = $derived(Object.values(gameStats.passes).reduce((acc, cur) => acc + cur, 0));

	$effect(() => {
		if (!chart && data.labels && data.labels.length > 0) {
			chart = new PieChart("#chart", data, {
				chartPadding: 0,
				showLabel: false,
			});
			chart.on("draw", (ctx) => {
				if (ctx.type === "slice") {
					ctx.element.attr({
						style: `fill: ${colors[ctx.index % colors.length]}; stroke: hsla(0,0%,100%,1.0); stroke-width: 1px;`,
					});
				}
			});
		}
	});

	$effect(() => {
		chart?.update(data);
	});

	onDestroy(() => {
		if (chart) {
			chart.detach();
		}
	});
</script>

<div
	class="absolute left-0 top-0 flex h-fit w-fit min-w-48 flex-col items-start justify-center gap-1 rounded rounded-tl-none bg-black bg-opacity-50 p-2 text-left text-base font-normal text-white shadow"
>
	<span class="text-base font-normal text-white">FPS: {Math.round(gameStats.fps)}</span>
	<span class=" text-sm font-light text-white">Frame: {(1000 / gameStats.fps).toFixed(2)} ms</span>
	{#if data.labels && data.labels.length > 0}
		<hr class="w-full opacity-25" />
		<div class="flex h-fit w-full flex-row items-center justify-between gap-4">
			<div class="grid w-44 grid-cols-[2fr_1fr] gap-1">
				<span class="text-base font-normal text-white">Render:</span>
				<span class="place-self-end text-nowrap text-sm font-light text-white"
					>{(graphicsTime / 1000).toFixed(2)} ms</span
				>
				{#each Object.entries(gameStats.passes) as [pass, time], index}
					<div class="text-xs font-light text-white">
						<span
							class="mr-1 inline-block h-2 w-2 rounded-full border border-white bg-opacity-100"
							style={`background-color: ${colors[index]};`}
						></span>
						{pass}:
					</div>
					<div class="place-self-end text-xs font-light text-white">{(time / 1000).toFixed(2)} ms</div>
				{/each}
			</div>
			<div id="chart" class="text-card-foreground h-36 w-36 py-2 pr-2"></div>
		</div>
	{/if}
</div>
