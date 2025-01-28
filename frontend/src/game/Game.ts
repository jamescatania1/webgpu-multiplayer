import { gameStats } from "$lib/stores.svelte";
import Input from "./Input";
import WasmWorker from "./wasm/WasmWorker?worker";
import Renderer from "./Renderer";

export type RenderContext = {
	adapter: GPUAdapter;
	device: GPUDevice;
	ctx: GPUCanvasContext;
};

export default class Game {
	private input: Input;
	private worker: Worker;

	private drawTime: number = 0;
	private frameTime: number = 0;
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
		const device = await adapter?.requestDevice();
		if (!device || !adapter) {
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
		};
	}
}
