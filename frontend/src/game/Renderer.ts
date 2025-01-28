import Camera from "./Camera";
import { mat4, vec2, vec3, type Mat4, type Vec2, type Vec3 } from "wgpu-matrix";
import type Input from "./Input";
import type { RenderContext } from "./Game";
import { loadShaders, type Shaders } from "./Shaders";
import Transform from "./Transform";
import Model, { loadBOBJ } from "./Model";

const MAX_VEL = 1.0;
const ACCEL = 0.01;
const MOUSE_SENSITIVITY = 2.0;
const SSAO_KERNEL_SIZE = 32;

export default class Renderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly device: GPUDevice;
	private readonly adapter: GPUAdapter;
	private readonly ctx: GPUCanvasContext;

	private readonly uniformBuffers: {
		camera: GPUBuffer;
	};
	private readonly globalUniformBindGroups: {
		camera: GPUBindGroup;
	};
	private readonly pipelines: {
		basic: GPURenderPipeline;
		PBR: GPURenderPipeline;
		depth: GPURenderPipeline;
		postFX: GPURenderPipeline;
	};
	private renderPassDescriptors: {
		depthPass: GPURenderPassDescriptor;
		sceneDraw: GPURenderPassDescriptor;
		postFX: GPURenderPassDescriptor;
	} | null = null;
	private readonly presentationFormat: GPUTextureFormat;

	private readonly shaders: Shaders;
	private readonly camera: Camera;
	private objects: Model[] = [];
	private cubes: Cube[] = [];
	private postFXQuad: {
		vertexBuffer: GPUBuffer;
		sampler: GPUSampler,
		bindGroup: GPUBindGroup | null,
	};

	private readonly inputVec: Vec2 = vec2.create();
	private readonly accel: Vec3 = vec3.create();
	private readonly vel: Vec3 = vec3.create();
	private readonly accelY: Vec3 = vec3.create();

	constructor(canvas: HTMLCanvasElement, context: RenderContext) {
		this.canvas = canvas;
		this.device = context.device;
		this.adapter = context.adapter;
		this.ctx = context.ctx;

		this.shaders = loadShaders(this.device);

		this.camera = new Camera(canvas);
		this.camera.position[2] = 5.0;

		this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this.ctx.configure({
			device: this.device,
			format: this.presentationFormat,
		});

		// camera data uniform buffer
		const cameraUniformBuffer = this.device.createBuffer({
			label: "camera uniform buffer",
			size: 16 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.uniformBuffers = {
			camera: cameraUniformBuffer,
		};

		// uniform bind group layouts
		const cameraBindGroupLayout = this.device.createBindGroupLayout({
			label: "camera data bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: {},
				},
			],
		});
		const transformBindGroupLayout = this.device.createBindGroupLayout({
			label: "transform bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: {},
				},
			],
		});
		const basicModelBindGroupLayout = this.device.createBindGroupLayout({
			label: "model bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: {},
				},
			],
		});

		// render pipelines
		const basicPipelineLayout = this.device.createPipelineLayout({
			bindGroupLayouts: [cameraBindGroupLayout, basicModelBindGroupLayout],
		});
		const basicRenderPipeline = this.device.createRenderPipeline({
			label: "render pipeline",
			layout: basicPipelineLayout,
			vertex: {
				module: this.shaders.basic,
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
				module: this.shaders.basic,
				entryPoint: "fs",
				targets: [{ format: this.presentationFormat }],
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
				count: 4,
			},
		});
		// pipelines for drawing the pbr scene models
		const sceneDrawPipelineLayout = this.device.createPipelineLayout({
			bindGroupLayouts: [cameraBindGroupLayout, transformBindGroupLayout],
		});
		const depthPrepassRenderPipeline = this.device.createRenderPipeline({
			label: "depth prepass",
			layout: sceneDrawPipelineLayout,
			vertex: {
				module: this.shaders.depth,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 4 * 4,
						stepMode: "vertex",
						attributes: [
							{
								//xyzc
								shaderLocation: 0,
								offset: 0,
								format: "uint32x2",
							},
						],
					},
				],
			},
			fragment: {
				module: this.shaders.depth,
				entryPoint: "fs",
				targets: [],
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
				count: 4,
			},
		});
		const PBRRenderPipeline = this.device.createRenderPipeline({
			label: "render pipeline",
			layout: sceneDrawPipelineLayout,
			vertex: {
				module: this.shaders.PBR,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 4 * 4,
						stepMode: "vertex",
						attributes: [
							{
								// xyzc
								shaderLocation: 0,
								offset: 0,
								format: "uint32x2",
							},
							{
								// normal
								shaderLocation: 1,
								offset: 2 * 4,
								format: "uint32",
							},
							{
								// uv
								shaderLocation: 2,
								offset: 3 * 4,
								format: "uint32",
							},
						],
					},
				],
			},
			fragment: {
				module: this.shaders.PBR,
				entryPoint: "fs",
				targets: [{ format: "rgba16float" }],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: {
				depthWriteEnabled: false,
				depthCompare: "equal",
				format: "depth24plus",
			},
			multisample: {
				count: 4,
			},
		});
		const postFXPipeline = this.device.createRenderPipeline({
			label: "post processing pipeline",
			layout: "auto",
			vertex: {
				module: this.shaders.postFX,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 8,
						stepMode: "vertex",
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x2",
							},
						],
					},
				],
			},
			fragment: {
				module: this.shaders.postFX,
				entryPoint: "fs",
				targets: [{ format: this.presentationFormat }],
			},
			primitive: {
				topology: "triangle-strip",
				cullMode: "back",
			},
			multisample: {
				count: 4,
			}
		});
		this.pipelines = {
			basic: basicRenderPipeline,
			depth: depthPrepassRenderPipeline,
			PBR: PBRRenderPipeline,
			postFX: postFXPipeline,
		};

		// global uniform bind groups
		const cameraUniformBindGroup = this.device.createBindGroup({
			layout: cameraBindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffers.camera, offset: 0, size: 16 * 4 },
				},
			],
		});
		this.globalUniformBindGroups = {
			camera: cameraUniformBindGroup,
		};

		// post processing quad buffers and sampler
		{
			const quadVertexData = new Float32Array([
				-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0,
			]);
			const quadVertexBuffer = this.device.createBuffer({
				label: "post fx quad vertex buffer",
				size: quadVertexData.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
				mappedAtCreation: true,
			});
			new Float32Array(quadVertexBuffer.getMappedRange()).set(quadVertexData);
			quadVertexBuffer.unmap();

			const sceneTextureSampler = this.device.createSampler({
				magFilter: "linear",
				minFilter: "linear",
			})

			this.postFXQuad = {
				vertexBuffer: quadVertexBuffer,
				sampler: sceneTextureSampler,
				bindGroup: null,
			};
		}

		// create the output textures and render pass descriptor
		this.buildRenderPassDescriptors();

		const numCubes = 10;
		for (let i = 0; i < numCubes; i++) {
			const cube = new Cube(this.device, basicModelBindGroupLayout);
			this.cubes.push(cube);
		}
		loadBOBJ(this.device, "/scene.bobj").then((data) => {
			const model = new Model(this.device, transformBindGroupLayout, data);
			this.objects.push(model);
		});
	}

	/** 
	 * Called upon initialization and change of the canvas size
	 **/
	private buildRenderPassDescriptors() {
		// output depth texture
		const depthTexture = this.device.createTexture({
			label: "scene depth texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: "depth24plus",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const depthView = depthTexture.createView();

		// scene draw color texture
		const sceneDrawTexture = this.device.createTexture({
			label: "scene draw texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: "rgba16float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const sceneDrawView = sceneDrawTexture.createView();

		// resolve texture for post-processing output
		const sceneResolveTexture = this.device.createTexture({
			label: "scene single-sample texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 1,
			format: "rgba16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const sceneResolveView = sceneResolveTexture.createView();

		// screen ouptut color texture
		const screenOutputTexture = this.device.createTexture({
			label: "post fx screen output texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: this.presentationFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const screenOutputView = screenOutputTexture.createView();

		// bind group for the post processing textures
		this.postFXQuad.bindGroup = this.device.createBindGroup({
			layout: this.pipelines.postFX.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: this.postFXQuad.sampler,
				},
				{
					binding: 1,
					resource: sceneResolveView,
				}
			]
		})

		// render pass descriptors
		const depthPassDescriptor: GPURenderPassDescriptor = {
			label: "depth pass descriptor",
			colorAttachments: [],
			depthStencilAttachment: {
				view: depthView,
				depthClearValue: 1.0,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		};
		const sceneDrawDescriptor: GPURenderPassDescriptor = {
			label: "output screen draw descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.15, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: sceneDrawView,
					resolveTarget: sceneResolveView,
				},
			],
			depthStencilAttachment: {
				view: depthView,
				depthLoadOp: "load",
				depthStoreOp: "discard",
			},
		};
		const postFXDescriptor: GPURenderPassDescriptor = {
			label: "post processing draw descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.0, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: screenOutputView,
					resolveTarget: this.ctx.getCurrentTexture().createView(),
				}
			]
		}

		this.renderPassDescriptors = {
			depthPass: depthPassDescriptor,
			sceneDraw: sceneDrawDescriptor,
			postFX: postFXDescriptor,
		};
	}

	// public add(obj: SceneObject) {
	//     this.objects.push(obj);
	// }

	// public remove(obj: SceneObject) {
	//     this.objects.splice(this.objects.indexOf(obj), 1);
	// }

	public draw(input: Input, deltaTime: number) {
		// game logic
		{
			// rotate camera with mouse delta
			if (input.pointerLocked) {
				this.camera.yaw += input.dx * MOUSE_SENSITIVITY;
				this.camera.pitch = Math.min(
					Math.PI / 2,
					Math.max(-Math.PI / 2, this.camera.pitch - input.dy * MOUSE_SENSITIVITY),
				);
			}

			// update input vector
			this.inputVec[0] =
				(input.keyDown("D") || input.keyDown("d") ? 1 : 0) - (input.keyDown("A") || input.keyDown("a") ? 1 : 0);
			(this.inputVec[1] =
				(input.keyDown("W") || input.keyDown("w") ? 1 : 0) -
				(input.keyDown("S") || input.keyDown("s") ? 1 : 0)),
				vec2.normalize(this.inputVec, this.inputVec);

			// update acceleration, velocity and position
			vec3.scale(this.camera.right, -this.inputVec[0], this.accel);
			vec3.scale(this.camera.forward, this.inputVec[1], this.accelY);
			vec3.add(this.accel, this.accelY, this.accel);

			this.vel[0] = Math.min(
				MAX_VEL,
				Math.max(-MAX_VEL, this.vel[0] + (this.accel[0] - this.vel[0]) * ACCEL * deltaTime),
			);
			this.vel[1] = Math.min(
				MAX_VEL,
				Math.max(-MAX_VEL, this.vel[1] + (this.accel[1] - this.vel[1]) * ACCEL * deltaTime),
			);
			this.vel[2] = Math.min(
				MAX_VEL,
				Math.max(-MAX_VEL, this.vel[2] + (this.accel[2] - this.vel[2]) * ACCEL * deltaTime),
			);

			vec3.addScaled(this.camera.position, this.vel, 0.01 * deltaTime, this.camera.position);

			// this.monke.transform.position[1] = Math.sin(performance.now() / 200) * 0.1 + 1.0;
			// this.monke.transform.rotation[0] = performance.now() / 100;
			// this.monke.transform.rotation[1] = performance.now() / 100;
			// this.monke.transform.rotation[2] = performance.now() / 100;
			// this.monke.transform.update(gl);
		}

		// update camera
		this.camera.update(this.canvas);

		// update uniforms
		{
			// update global ubo
			this.device.queue.writeBuffer(
				this.uniformBuffers.camera,
				0,
				this.camera.viewProjMatrix.buffer,
				this.camera.viewProjMatrix.byteOffset,
				this.camera.viewProjMatrix.byteLength,
			);

			for (let i = 0; i < this.cubes.length; i++) {
				this.cubes[i].update(this.device, i * 2);
			}
		}

		// basic
		// pass.setPipeline(this.pipelines.basic);
		// pass.setBindGroup(0, this.globalUniformBindGroups.camera);

		// for (const cube of this.cubes) {
		// 	pass.setBindGroup(1, cube.modelData.uniformBindGroup);
		// 	pass.setVertexBuffer(0, cube.modelData.vertexBuffer);
		// 	pass.setIndexBuffer(cube.modelData.indexBuffer, cube.modelData.indexFormat);
		// 	pass.drawIndexed(cube.modelData.indexCount);
		// }

		(this.renderPassDescriptors!.postFX.colorAttachments as any)[0].resolveTarget = this.ctx
			.getCurrentTexture()
			.createView();
		const encoder = this.device.createCommandEncoder({ label: "render encoder" });

		{
			// depth prepass
			const depthPass = encoder.beginRenderPass(this.renderPassDescriptors!.depthPass);
			depthPass.setPipeline(this.pipelines.depth);
			depthPass.setBindGroup(0, this.globalUniformBindGroups.camera);

			for (const model of this.objects) {
				depthPass.setBindGroup(1, model.transformUniformBindGroup);
				depthPass.setVertexBuffer(0, model.modelData.vertexBuffer);
				depthPass.setIndexBuffer(model.modelData.indexBuffer, model.modelData.indexFormat);
				depthPass.drawIndexed(model.modelData.indexCount);
			}
			depthPass.end();
		}

		{
			// screen draw pass
			const drawPass = encoder.beginRenderPass(this.renderPassDescriptors!.sceneDraw);
			drawPass.setPipeline(this.pipelines.PBR);
			drawPass.setBindGroup(0, this.globalUniformBindGroups.camera);

			for (const model of this.objects) {
				drawPass.setBindGroup(1, model.transformUniformBindGroup);
				drawPass.setVertexBuffer(0, model.modelData.vertexBuffer);
				drawPass.setIndexBuffer(model.modelData.indexBuffer, model.modelData.indexFormat);
				drawPass.drawIndexed(model.modelData.indexCount);
			}
			drawPass.end();
		}

		{
			// post processing pass
			const postFXPass = encoder.beginRenderPass(this.renderPassDescriptors!.postFX);
			postFXPass.setPipeline(this.pipelines.postFX);
			
			postFXPass.setBindGroup(0, this.postFXQuad.bindGroup);
			postFXPass.setVertexBuffer(0, this.postFXQuad.vertexBuffer);
			postFXPass.draw(5);
			postFXPass.end();
		}

		this.device.queue.submit([encoder.finish()]);
	}

	public onResize() {
		this.buildRenderPassDescriptors();
	}
}

class Cube {
	public readonly modelData: {
		vertexBuffer: GPUBuffer;
		indexBuffer: GPUBuffer;
		indexFormat: GPUIndexFormat;
		indexCount: number;
		uniformBuffer: GPUBuffer;
		uniformBindGroup: GPUBindGroup;
		transform: Transform;
	};

	constructor(device: GPUDevice, basicModelBindGroupLayout: GPUBindGroupLayout) {
		// vertex buffer for cube
		// prettier-ignore
		const vertexData = new Float32Array([
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

		const vertexBuffer = device.createBuffer({
			label: "cube vertex buffer",
			size: vertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
		vertexBuffer.unmap();

		// index buffer for cube
		// prettier-ignore
		const indexData = new Uint16Array([
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
		const indexBuffer = device.createBuffer({
			label: "cube index buffer",
			size: indexData.byteLength,
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
		});
		new Uint16Array(indexBuffer.getMappedRange()).set(indexData);
		indexBuffer.unmap();

		// create uniform buffer for cube
		const uniformBuffer = device.createBuffer({
			size: 16 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const uniformBindGroup = device.createBindGroup({
			layout: basicModelBindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: {
						buffer: uniformBuffer,
					},
				},
			],
		});

		this.modelData = {
			vertexBuffer: vertexBuffer,
			indexBuffer: indexBuffer,
			indexFormat: "uint16",
			indexCount: indexData.length,
			uniformBuffer: uniformBuffer,
			uniformBindGroup: uniformBindGroup,
			transform: new Transform(),
		};
	}

	public update(device: GPUDevice, yPos: number) {
		const timestamp = performance.now() / 1000 + yPos * 0.1;
		this.modelData.transform.rotation.set([Math.sin(timestamp), Math.cos(timestamp), 0]);
		this.modelData.transform.position[1] = yPos;
		this.modelData.transform.update();
		device.queue.writeBuffer(
			this.modelData.uniformBuffer,
			0,
			this.modelData.transform.matrix.buffer,
			this.modelData.transform.matrix.byteOffset,
			this.modelData.transform.matrix.byteLength,
		);
	}
}
