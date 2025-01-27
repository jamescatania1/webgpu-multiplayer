import { gameStats } from "$lib/stores.svelte";
import Input from "./Input";
import Scene from "./Scene";
import WasmWorker from "./wasm/WasmWorker?worker";

export default class Game {
	// private input: Input;
	private worker: Worker;

	private drawTime: number = 0;
	private frameTime: number = 0;
	private statsPollCount: number = 0;
	private statsPollStart: number = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.init(canvas)
			.then(() => {
				console.log("Game initialized");
			})
			.catch((e) => {
				console.error(e);
			});
		// const gl = canvas.getContext("webgl2");
		// if (!gl) {
		// 	throw new Error("Unable to initialize WebGL. Your browser or machine may not support it.");
		// }
		// if (!gl.getExtension("EXT_color_buffer_float")) {
		// 	throw new Error("Rendering to floating point textures is not supported on this platform");
		// }
		// if (!gl.getExtension("OES_texture_float_linear")) {
		// 	throw new Error("Rendering to floating point textures is not supported on this platform");
		// }

		// const input = new Input(canvas);
		// const scene = new Scene(gl);
		// this.input = input;

		// // main draw loop
		// let prevTime = NaN;
		// const draw = (time: number) => {
		// 	if (Number.isNaN(prevTime)) {
		// 		prevTime = time;
		// 	}
		// 	const deltaTime = Math.max(0, time - prevTime);
		// 	prevTime = time;

		// 	const startTime = performance.now();
		// 	scene.draw(gl, input, deltaTime);

		// 	const endTime = performance.now();
		// 	this.drawTime += endTime - startTime;
		// 	this.frameTime += deltaTime;
		// 	this.statsPollCount += 1;
		// 	if (endTime - this.statsPollStart > 250) {
		// 		gameStats.drawTime = this.drawTime / this.statsPollCount;
		// 		gameStats.fps = 1000.0 / (this.frameTime / this.statsPollCount);
		// 		this.statsPollStart = endTime;
		// 		this.statsPollCount = 0;
		// 		this.drawTime = 0;
		// 		this.frameTime = 0;
		// 	}

		// 	input.update();

		// 	requestAnimationFrame(draw);
		// };

		// requestAnimationFrame(draw);

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
		// this.input.onDestroy();
		this.worker.terminate();
	}

	public async init(canvas: HTMLCanvasElement) {
		const adapter = await navigator.gpu?.requestAdapter();
		const device = await adapter?.requestDevice();
		if (!device || !navigator) {
			throw new Error("WebGPU not supported on this browser");
		}

		const ctx = canvas.getContext("webgpu");
		if (!ctx) {
			throw new Error("Failed to bind game to the active canvas.");
		}

		const resize = () => {
			canvas.width = Math.min(window.innerWidth, device.limits.maxTextureDimension2D);
			canvas.height = Math.min(window.innerHeight, device.limits.maxTextureDimension2D);
		};
		resize();

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		ctx.configure({
			device: device,
			format: presentationFormat,
		});

		const vertexShader = device.createShaderModule({
			label: "vertex shader",
			code: vertexShaderSource,
		});
		const fragmentShader = device.createShaderModule({
			label: "fragment shader",
			code: fragmentShaderSource,
		});

		const pipeline = device.createRenderPipeline({
			label: "render pipeline",
			layout: "auto",
			vertex: { module: vertexShader },
			fragment: {
				module: fragmentShader,
				targets: [{ format: presentationFormat }],
			},
		});
		const renderPassDescriptor = {
			label: "render pass descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.25, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: ctx.getCurrentTexture().createView(),
				},
			],
		} as GPURenderPassDescriptor;
		const screenAttachment = (renderPassDescriptor.colorAttachments as any)[0];

		const render = () => {
			screenAttachment.view = ctx.getCurrentTexture().createView();

			const encoder = device.createCommandEncoder({ label: "render encoder" });
			const pass = encoder.beginRenderPass(renderPassDescriptor);
			pass.setPipeline(pipeline);
			pass.draw(6);
			pass.end();

			device.queue.submit([encoder.finish()]);
		};
	}
}

const vertexShaderSource = /* wgsl */ `
	// data structure to store output of vertex function
	struct VertexOut {
		@builtin(position) pos: vec4f,
		@location(0) color: vec4f
	};

	// process the points of the triangle
	@vertex 
	fn vs(
		@builtin(vertex_index) vertexIndex : u32
	) -> VertexOut {
		let pos = array(
			vec2f(   0,  0.8),  // top center
			vec2f(-0.8, -0.8),  // bottom left
			vec2f( 0.8, -0.8)   // bottom right
		);

		let color = array(
			vec4f(1.0, .0, .0, .0),
			vec4f( .0, 1., .0, .0),
			vec4f( .0, .0, 1., .0)
		);

		var out: VertexOut;
		out.pos = vec4f(pos[vertexIndex], 0.0, 1.0);
		out.color = color[vertexIndex];

		return out;
	}
`;

const fragmentShaderSource = /* wgsl */ `
	// data structure to input to fragment shader
	struct VertexOut {
		@builtin(position) pos: vec4f,
		@location(0) color: vec4f
	};

	// set the colors of the area within the triangle
	@fragment 
	fn fs(in: VertexOut) -> @location(0) vec4f {
		return in.color;
	}
`;
