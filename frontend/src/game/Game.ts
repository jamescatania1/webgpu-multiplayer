import { gameStats } from "$lib/stores.svelte";
import Input from "./Input";
import Scene from "./Scene";
import WasmWorker from "./wasm/WasmWorker?worker";
import { mat4, vec3 } from "wgpu-matrix";
import { default as cubeShaderSource } from "./shaders/cube.wgsl";
import Renderer from "./Renderer";

const MSAA_SAMPLES = 4;

export type RenderContext = {
	adapter: GPUAdapter,
	device: GPUDevice,
	ctx: GPUCanvasContext,
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
				const renderer = new Renderer(canvas, ctx);
			})
			.catch((e) => {
				console.error(e);
			});

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
			ctx: ctx 
		};

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

		const cubeShader = device.createShaderModule({
			label: "cube shader",
			code: cubeShaderSource,
		});

		const pipeline = device.createRenderPipeline({
			label: "render pipeline",
			layout: "auto",
			vertex: {
				module: cubeShader,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 6 * 4,
						stepMode: "vertex",
						attributes: [
							{
								// position
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
							{
								// color
								shaderLocation: 1,
								offset: 3 * 4,
								format: "float32x3",
							},
						],
					},
				],
			},
			fragment: {
				module: cubeShader,
				entryPoint: "fs",
				targets: [{ format: presentationFormat }],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: {
				depthWriteEnabled: true,
				depthCompare: "less-equal",
				format: "depth24plus",
			},
			multisample: {
				count: MSAA_SAMPLES,
			}
		});
		const depthTexture = device.createTexture({
			size: [canvas.width, canvas.height],
			sampleCount: MSAA_SAMPLES,
			format: "depth24plus",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const depthView = depthTexture.createView();
		const outputTexture = device.createTexture({
			size: [canvas.width, canvas.height],
			sampleCount: MSAA_SAMPLES,
			format: presentationFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const outputView = outputTexture.createView();

		// global data uniform buffer
		const globalUniformBuffer = device.createBuffer({
			size: 16 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const globalUniformBindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: globalUniformBuffer,
					},
				},
			],
		});

		const renderPassDescriptor: GPURenderPassDescriptor = {
			label: "render pass descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.15, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: outputView,
					resolveTarget: ctx.getCurrentTexture().createView(),
				},
			],
			depthStencilAttachment: {
				view: depthView,
				depthClearValue: 1.0,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		};
		const screenAttachment = (renderPassDescriptor.colorAttachments as any)[0];

		// vertex buffer for cube
		// prettier-ignore
		const cubeVertexData = new Float32Array([
			// x, y, z,    r, g, b
			-0.5, -0.5,  0.5,   1.0, 0.0, 0.0,  // front bottom left
			 0.5, -0.5,  0.5,   0.0, 1.0, 0.0,  // front bottom right
			 0.5,  0.5,  0.5,   0.0, 0.0, 1.0,  // front top right
			-0.5,  0.5,  0.5,   1.0, 1.0, 0.0,  // front top left
			-0.5, -0.5, -0.5,   0.0, 1.0, 1.0,  // back bottom left
			 0.5, -0.5, -0.5,   1.0, 0.0, 1.0,  // back bottom right
			 0.5,  0.5, -0.5,   1.0, 1.0, 1.0,  // back top right
			-0.5,  0.5, -0.5,   1.0, 0.0, 0.0,  // back top left
		]);

		const cubeVertexBuffer = device.createBuffer({
			label: "cube vertex buffer",
			size: cubeVertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(cubeVertexBuffer.getMappedRange()).set(cubeVertexData);
		cubeVertexBuffer.unmap();

		// index buffer for cube
		// prettier-ignore
		const cubeIndexData = new Uint16Array([
			// front
			0, 1, 2,  0, 2, 3,
			// right
			1, 5, 6,  1, 6, 2,
			// back
			5, 4, 7,  5, 7, 6,
			// left
			4, 0, 3,  4, 3, 7,
			// top
			3, 2, 6,  3, 6, 7,
			// bottom
			4, 5, 1,  4, 1, 0,
		]);
		const cubeIndexBuffer = device.createBuffer({
			label: "cube index buffer",
			size: cubeIndexData.byteLength,
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
		});
		new Uint16Array(cubeIndexBuffer.getMappedRange()).set(cubeIndexData);
		cubeIndexBuffer.unmap();

		// uniform buffer for cube
		const cubeUniformBuffer = device.createBuffer({
			size: 16 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const cubeUniformBindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(1),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: cubeUniformBuffer,
					},
				},
			],
		});
		const cubeModelMatrix = mat4.identity();

		// write matrix data to the global uniform buffer
		const viewMatrix = mat4.identity();
		mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);
		const aspect = canvas.width / canvas.height;
		const projMatrix = mat4.perspective((80 * Math.PI) / 180, aspect, 0.1, 100);
		const viewProjMatrix = mat4.multiply(projMatrix, viewMatrix);
		device.queue.writeBuffer(
			globalUniformBuffer,
			0,
			viewProjMatrix.buffer,
			viewProjMatrix.byteOffset,
			viewProjMatrix.byteLength,
		);

		const render = () => {
			mat4.identity(cubeModelMatrix);
			const timestamp = performance.now() / 1000;
			mat4.rotate(
				cubeModelMatrix,
				vec3.fromValues(Math.sin(timestamp), Math.cos(timestamp), 0),
				1,
				cubeModelMatrix,
			);
			device.queue.writeBuffer(
				cubeUniformBuffer,
				0,
				cubeModelMatrix.buffer,
				cubeModelMatrix.byteOffset,
				cubeModelMatrix.byteLength,
			);

			screenAttachment.resolveTarget = ctx.getCurrentTexture().createView();

			const encoder = device.createCommandEncoder({ label: "render encoder" });
			const pass = encoder.beginRenderPass(renderPassDescriptor);
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, globalUniformBindGroup);
			pass.setBindGroup(1, cubeUniformBindGroup);
			pass.setVertexBuffer(0, cubeVertexBuffer);
			pass.setIndexBuffer(cubeIndexBuffer, "uint16");
			pass.drawIndexed(cubeIndexData.length);
			pass.end();

			device.queue.submit([encoder.finish()]);

			window.requestAnimationFrame(render);
		};

		window.requestAnimationFrame(render);
	}
}
