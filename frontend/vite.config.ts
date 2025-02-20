import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type HmrContext } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import glsl from "vite-plugin-glsl";

export default defineConfig({
	plugins: [
		sveltekit(),
		wasm(),
		topLevelAwait(),
		glsl(),
		{
			name: "full-reload",
			handleHotUpdate(ctx: HmrContext) {
				if (ctx.modules.some(mod => /.*\/src\/game/g.test(mod.url))) {
					ctx.server.ws.send({ type: "full-reload" });
					ctx.server.ws.send({
						type: "custom",
						event: "game reload",
						data: "Game files changed, reloading...",
					})
					return [];
				}
				else {
					return ctx.modules;
				}
			},
		},
	],
});
