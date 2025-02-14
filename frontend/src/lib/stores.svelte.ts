import { SHADOW_SETTINGS } from "$game/Renderer";

export const gameStats = $state<{
	fps: number;
	passes: {
		[key: string]: number;
	};
}>({
	fps: 0,
	passes: {},
});
