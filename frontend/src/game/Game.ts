import { gameStats } from "$lib/stores.svelte";
import Input from "./Input";
import WasmWorker from "./wasm/WasmWorker?worker";
import Renderer, { DEBUG_GRAPHICS_TIME } from "./Renderer";

export type RenderContext = {
	adapter: GPUAdapter;
	device: GPUDevice;
	ctx: GPUCanvasContext;
	timestampQuery: boolean;
};

if (import.meta.hot) {
	import.meta.hot.on("game reload", (message) => {
		console.log(message);
	});
}

export default class Game {
	private input: Input;
	private worker: Worker;

	private frameTime: number = 0;
	private graphicsTime: { [key: string]: number } | null = null;
	private statsPollCount: number = 0;
	private statsPollStart: number = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.input = new Input(canvas);

		this.init(canvas)
			.then((ctx) => {
				let renderer: Renderer | null = null;
				const resize = () => {
					canvas.width = Math.min(window.innerWidth, ctx.device.limits.maxTextureDimension2D);
					canvas.height = Math.min(window.innerHeight, ctx.device.limits.maxTextureDimension2D);
					renderer?.onResize();
				};
				resize();
				window.addEventListener("resize", resize);

				renderer = new Renderer(canvas, ctx);

				if (renderer.timestampData) {
					this.graphicsTime = { ...renderer.timestampData.data };
				}

				// main draw loop
				let prevTime = NaN;
				const draw = (time: number) => {
					if (Number.isNaN(prevTime)) {
						prevTime = time;
					}
					const deltaTime = Math.max(0, time - prevTime);
					prevTime = time;

					const startTime = performance.now();
					renderer.draw(this.input, deltaTime);

					const endTime = performance.now();
					this.frameTime += deltaTime;
					if (this.graphicsTime) {
						for (const key in this.graphicsTime) {
							this.graphicsTime[key] += renderer.timestampData!.data[key];
						}
					}
					this.statsPollCount++;
					if (endTime - this.statsPollStart > 250) {
						const frameStats: { [key: string]: number } = {};
						if (this.graphicsTime) {
							for (const label in this.graphicsTime) {
								frameStats[label] = this.graphicsTime[label] / this.statsPollCount;
								this.graphicsTime[label] = 0;
							}
						}
						gameStats.passes = frameStats;
						gameStats.fps = 1000.0 / (this.frameTime / this.statsPollCount);
						this.statsPollStart = endTime;
						this.statsPollCount = 0;
						this.frameTime = 0;
					}

					this.input.update();

					requestAnimationFrame(draw);
				};

				requestAnimationFrame(draw);
			})
			.catch((e) => {
				console.error(e);
			});

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

	public async init(canvas: HTMLCanvasElement): Promise<RenderContext> {
		const adapter = await navigator.gpu?.requestAdapter();
		if (!adapter) {
			throw new Error("WebGPU not supported on this browser");
		}
		let timestampQuery = DEBUG_GRAPHICS_TIME;
		if (DEBUG_GRAPHICS_TIME && !adapter.features.has("timestamp-query")) {
			timestampQuery = false;
			console.error("Device is unable to time graphics operations, disabling debug graphics stats.");
		}
		const device = await (timestampQuery
			? adapter.requestDevice({ requiredFeatures: ["timestamp-query"] })
			: adapter.requestDevice());
		if (!device) {
			throw new Error("WebGPU not supported on this browser");
		}

		const ctx = canvas.getContext("webgpu");
		if (!ctx) {
			throw new Error("Failed to bind game to the active canvas.");
		}

		return {
			adapter: adapter,
			device: device,
			ctx: ctx,
			timestampQuery: timestampQuery,
		};
	}
}
