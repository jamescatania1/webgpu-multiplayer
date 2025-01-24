import {gameStats } from "$lib/stores.svelte";
import Input from "./Input";
import Scene from "./Scene";
import WasmWorker from "./wasm/WasmWorker?worker";

export default class Game {
	private input: Input;
	private worker: Worker;

	private drawTime: number = 0;
	private frameTime: number = 0;
	private statsPollCount: number = 0;
	private statsPollStart: number = 0;

	constructor(canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl2");
		if (!gl) {
			throw new Error("Unable to initialize WebGL. Your browser or machine may not support it.");
		}
		if (!gl.getExtension("EXT_color_buffer_float")) {
			throw new Error("Rendering to floating point textures is not supported on this platform");
		}
		if (!gl.getExtension("OES_texture_float_linear")) {
			throw new Error("Rendering to floating point textures is not supported on this platform");
		}

		const input = new Input(canvas);
		const scene = new Scene(gl);
		this.input = input;

		// main draw loop
		let prevTime = NaN;
		const draw = (time: number) => {
			if (Number.isNaN(prevTime)) {
				prevTime = time;
			}
			const deltaTime = Math.max(0, time - prevTime);
			prevTime = time;

			const startTime = performance.now();
			scene.draw(gl, input, deltaTime);

			const endTime = performance.now();
			this.drawTime += endTime - startTime;
			this.frameTime += deltaTime;
			this.statsPollCount += 1;
			if (endTime - this.statsPollStart > 250) {
				gameStats.drawTime = this.drawTime / this.statsPollCount;
				gameStats.fps = 1000.0 / (this.frameTime / this.statsPollCount);
				this.statsPollStart = endTime;
				this.statsPollCount = 0;
				this.drawTime = 0;
				this.frameTime = 0;
			}

			input.update();

			requestAnimationFrame(draw);
		};

		requestAnimationFrame(draw);

		// init socket and worker for communication
		const worker = new WasmWorker();

		worker.onmessage = (e) => {
			if (e.data === "socket closed") {
				worker.terminate();
			}
		};

		this.worker = worker;
	}

	public onDestroy() {
		this.input.onDestroy();
		this.worker.terminate();
	}
}
