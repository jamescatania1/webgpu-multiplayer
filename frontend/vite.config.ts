import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import glsl from 'vite-plugin-glsl';

export default defineConfig({
	plugins: [sveltekit(), wasm(), topLevelAwait(), glsl()]
});