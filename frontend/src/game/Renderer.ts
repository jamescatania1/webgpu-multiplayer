import Camera from "./Camera";
import { mat4, vec2, vec3, vec4, type Mat4, type Vec2, type Vec3, type Vec4 } from "wgpu-matrix";
import type Input from "./Input";
import type { RenderContext } from "./Game";
import { loadShaders, type Shaders } from "./Shaders";
import Transform from "./Transform";
import Model, { loadBOBJ } from "./Model";
import Sky from "./Sky";

const MAX_VEL = 1.0;
const ACCEL = 0.01;
const MOUSE_SENSITIVITY = 2.0;
export const ssaoSettings = {
	sampleCount: 64,
	radius: 0.4,
	bias: 0.05,
	kernelDotCutOff: 0.025,
	noiseTextureSize: 32,
	noiseScale: 1000.0,
	fadeStart: 45.0,
	fadeEnd: 105.0,
};
export const shadowSettings = {
	resolution: 2048,
	cascades: [
		{
			depthScale: 300.0,
			near: 0.1,
			far: 10.0,
			bias: 0.0001,
			normalBias: 0.1,
			pcfRadius: 3,
		},
		{
			depthScale: 300.0,
			near: 8.1,
			far: 30.0,
			bias: 0.00015,
			normalBias: 0.15,
			pcfRadius: 2,
		},
		{
			depthScale: 300.0,
			near: 25.0,
			far: 100.0,
			bias: 0.0001,
			normalBias: 0.15,
			pcfRadius: 1,
		},
	],
};
export const sunSettings = {
	position: vec3.fromValues(20, 50, 17),
	direction: vec3.normalize(vec3.fromValues(20, 50, 17)),
	color: vec3.normalize(vec3.fromValues(1, 240.0 / 255.0, 214.0 / 255.0)),
	intensity: 0.75,
};
export const skySettings = {
	skyboxSource: "sky",
	skyboxResolution: 2048,
	irradianceResolution: 64,
	irradianceSampleDelta: 0.025,
	prefilterResolution: 256,
	prefilterMipLevels: 5,
	prefilterSamples: 2048,
	brdfResolution: 1024,
	brdfSamples: 2048,
};

export default class Renderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly device: GPUDevice;
	private readonly adapter: GPUAdapter;
	private readonly ctx: GPUCanvasContext;

	private readonly uniformBuffers: {
		camera: GPUBuffer;
		shadows: GPUBuffer;
	};
	private readonly uniformBufferData: {
		camera: Float32Array;
		shadows: Float32Array;
	};
	private globalUniformBindGroupLayouts: {
		camera: GPUBindGroupLayout;
		shadows: GPUBindGroupLayout;
		depth: GPUBindGroupLayout;
		scene: GPUBindGroupLayout;
	};
	private globalUniformBindGroups: {
		camera: GPUBindGroup | null;
		shadows: GPUBindGroup[];
		depth: GPUBindGroup | null;
		scene: GPUBindGroup | null;
		drawTexture: GPUBindGroup | null;
	};
	private readonly pipelines: {
		PBR: GPURenderPipeline;
		depth: GPURenderPipeline;
		shadows: GPURenderPipeline;
		postFX: GPURenderPipeline;
	};
	private renderPassDescriptors: {
		depthPass: GPURenderPassDescriptor | null;
		shadowPass: GPURenderPassDescriptor[] | null;
		sceneDraw: GPURenderPassDescriptor | null;
		postFX: GPURenderPassDescriptor | null;
	};
	private shadowData: {
		texture: GPUTexture | null;
	};
	private readonly presentationFormat: GPUTextureFormat;

	private readonly shaders: Shaders;
	private readonly camera: Camera;
	private readonly sky: Sky;
	private objects: Model[] = [];
	private postFXQuad: {
		vertexBuffer: GPUBuffer;
		sampler: GPUSampler;
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
		this.camera.position[1] = 5.0;

		this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this.ctx.configure({
			device: this.device,
			format: this.presentationFormat,
		});

		this.sky = new Sky(this, this.device, this.camera, this.shaders);
		this.shadowData = {
			texture: null,
		};

		// uniform bind group layouts
		const cameraBindGroupLayout = this.device.createBindGroupLayout({
			label: "camera data bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: {},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: {},
				},
			],
		});
		const shadowsBindGroupLayout = this.device.createBindGroupLayout({
			label: "shadow pass bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: {},
				},
			],
		});
		const depthBindGroupLayout = this.device.createBindGroupLayout({
			label: "depth texture bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						viewDimension: "2d-array",
						sampleType: "depth",
					},
				},
				{
					// screen size, can move elsewhere later
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: {},
				},
			],
		});
		const sceneBindGroupLayout = this.device.createBindGroupLayout({
			label: "scene render bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {},
				},
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						viewDimension: "cube",
					},
				},
				{
					binding: 4,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						viewDimension: "cube",
					},
				},
				{
					binding: 5,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {},
				},
				{
					binding: 6,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: {},
				},
				{
					binding: 7,
					visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
					buffer: {},
				},
				{
					binding: 8,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {
						type: "comparison",
					}
				}
			],
		});
		this.globalUniformBindGroupLayouts = {
			camera: cameraBindGroupLayout,
			shadows: shadowsBindGroupLayout,
			depth: depthBindGroupLayout,
			scene: sceneBindGroupLayout,
		};
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

		// pipelines for drawing the pbr scene models
		const depthPrepassPipelineLayout = this.device.createPipelineLayout({
			label: "depth prepass layout",
			bindGroupLayouts: [this.globalUniformBindGroupLayouts.camera, transformBindGroupLayout],
		});
		const depthPrepassRenderPipeline = this.device.createRenderPipeline({
			label: "depth prepass",
			layout: depthPrepassPipelineLayout,
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
				targets: [{ format: "r16float", writeMask: GPUColorWrite.RED }],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: {
				depthWriteEnabled: true,
				depthCompare: "less-equal",
				format: "depth32float",
			},
			multisample: {
				count: 4,
			},
		});
		const shadowDepthPipelineLayout = this.device.createPipelineLayout({
			label: "shadow pass layout",
			bindGroupLayouts: [this.globalUniformBindGroupLayouts.shadows, transformBindGroupLayout],
		});
		const shadowDepthRenderPipeline = this.device.createRenderPipeline({
			label: "shadow depth pass pipeline",
			layout: shadowDepthPipelineLayout,
			vertex: {
				module: this.shaders.shadows,
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
				module: this.shaders.shadows,
				entryPoint: "fs",
				targets: [],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: {
				depthBias: 0.05,
				depthBiasSlopeScale: 2.0,
				depthWriteEnabled: true,
				depthCompare: "less",
				format: "depth32float",
			},
		});

		const PBRPipelineLayout = this.device.createPipelineLayout({
			label: "PBR render pipeline layout",
			bindGroupLayouts: [
				this.globalUniformBindGroupLayouts.camera,
				transformBindGroupLayout,
				this.globalUniformBindGroupLayouts.depth,
				this.globalUniformBindGroupLayouts.scene,
			],
		});
		const PBRRenderPipeline = this.device.createRenderPipeline({
			label: "render pipeline",
			layout: PBRPipelineLayout,
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
				targets: [{ format: "rgba16float" }, { format: "r16float" }],
				constants: {
					ssao_samples: ssaoSettings.sampleCount,
					ssao_radius: ssaoSettings.radius,
					ssao_bias: ssaoSettings.bias,
					ssao_noise_scale: ssaoSettings.noiseScale,
					ssao_fade_start: ssaoSettings.fadeStart,
					ssao_fade_end: ssaoSettings.fadeEnd,
					near: this.camera.near,
					far: this.camera.far,
				},
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: {
				depthWriteEnabled: false,
				depthCompare: "equal",
				format: "depth32float",
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
			},
		});
		this.pipelines = {
			depth: depthPrepassRenderPipeline,
			shadows: shadowDepthRenderPipeline,
			PBR: PBRRenderPipeline,
			postFX: postFXPipeline,
		};

		const cascadeBufferSizeBytes = 256;
		this.uniformBuffers = {
			camera: this.device.createBuffer({
				label: "camera uniform buffer",
				size: 36 * 4,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			}),
			shadows: this.device.createBuffer({
				label: "shadow cascades uniform buffer",
				size: shadowSettings.cascades.length * cascadeBufferSizeBytes,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			}),
		};
		this.uniformBufferData = {
			camera: new Float32Array(this.uniformBuffers.camera.size / 4),
			shadows: new Float32Array(this.uniformBuffers.shadows.size / 4),
		};

		const cameraBindGroup = this.device.createBindGroup({
			layout: this.globalUniformBindGroupLayouts.camera,
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffers.camera, offset: 0, size: this.uniformBuffers.camera.size },
				},
				{
					binding: 1,
					resource: {
						buffer: this.uniformBuffers.shadows,
						offset: 0,
						size: this.uniformBuffers.shadows.size,
					},
				},
			],
		});
		const shadowBindGroups = [];
		for (let i = 0; i < shadowSettings.cascades.length; i++) {
			shadowBindGroups.push(
				this.device.createBindGroup({
					layout: this.globalUniformBindGroupLayouts.shadows,
					entries: [
						{
							binding: 0,
							resource: {
								buffer: this.uniformBuffers.shadows,
								offset: i * cascadeBufferSizeBytes,
								size: cascadeBufferSizeBytes,
							},
						}
					]
				})
			)
		}

		this.globalUniformBindGroups = {
			camera: cameraBindGroup,
			shadows: shadowBindGroups,
			// depend on the lighting load state, and is created in onLightingLoad
			scene: null,
			// depend on the screen size, and are created in buildScreenRenderDescriptors
			depth: null,
			drawTexture: null,
		};

		// post processing quad buffers and sampler
		{
			const quadVertexData = new Float32Array([-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0]);
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
			});

			this.postFXQuad = {
				vertexBuffer: quadVertexBuffer,
				sampler: sceneTextureSampler,
			};
		}

		this.renderPassDescriptors = {
			depthPass: null,
			sceneDraw: null,
			postFX: null,
			shadowPass: null,
		};
		// create the shadow mapping textures and pass descriptor
		this.buildShadowRenderDescriptor();
		// create the output textures and render pass descriptor
		this.buildScreenRenderDescriptors();

		loadBOBJ(this.device, "/city.bobj").then((data) => {
			const model = new Model(this.device, this.camera, transformBindGroupLayout, data);
			this.objects.push(model);
		});
	}

	/**
	 * Called upon initialization and change of the canvas size
	 **/
	private buildScreenRenderDescriptors() {
		if (!this.shadowData.texture) {
			return;
		}

		// output depth texture
		const depthTexture = this.device.createTexture({
			label: "scene depth texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: "depth32float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const depthView = depthTexture.createView();

		// the depth texture drawn to by the depth pass
		const depthDrawTexture = this.device.createTexture({
			label: "draw depth texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: "r16float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const depthDrawView = depthDrawTexture.createView();

		// resolve depth texture to be able to sample in ssao
		const depthResolveTexture = this.device.createTexture({
			label: "resolve depth draw texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 1,
			format: "r16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const depthResolveView = depthResolveTexture.createView();

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
			label: "scene single-sample resolve texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 1,
			format: "rgba16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const sceneResolveView = sceneResolveTexture.createView();

		// ssao output texture
		const ssaoOutTexture = this.device.createTexture({
			label: "ssao draw output texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: "r16float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const ssaoOutView = ssaoOutTexture.createView();

		// resolve texture for ssao output
		const ssaoResolveTexture = this.device.createTexture({
			label: "ssao single-sample resolve texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 1,
			format: "r16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const ssaoResolveView = ssaoResolveTexture.createView();

		// screen postfx ouptut color texture
		const screenOutputTexture = this.device.createTexture({
			label: "post fx screen output texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: this.presentationFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const screenOutputView = screenOutputTexture.createView();

		const depthUniformScreenSizeBuffer = this.device.createBuffer({
			size: 2 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(depthUniformScreenSizeBuffer.getMappedRange()).set([this.canvas.width, this.canvas.height]);
		depthUniformScreenSizeBuffer.unmap();

		// bind group for the depth texture
		this.globalUniformBindGroups.depth = this.device.createBindGroup({
			label: "depth texture bind group",
			layout: this.globalUniformBindGroupLayouts.depth,
			entries: [
				{
					binding: 0,
					resource: this.device.createSampler({
						magFilter: "linear",
						minFilter: "linear",
						addressModeU: "clamp-to-edge",
						addressModeV: "clamp-to-edge",
					}),
				},
				{
					binding: 1,
					resource: depthResolveView,
				},
				{
					binding: 2,
					resource: this.shadowData.texture.createView({
						dimension: "2d-array",
					}),
				},
				{
					binding: 3,
					resource: {
						buffer: depthUniformScreenSizeBuffer,
						offset: 0,
						size: 2 * 4,
					},
				},
			],
		});

		// bind group for the post processing textures
		this.globalUniformBindGroups.drawTexture = this.device.createBindGroup({
			label: "post processing draw texture bind group",
			layout: this.pipelines.postFX.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: this.postFXQuad.sampler,
				},
				{
					binding: 1,
					resource: sceneResolveView,
				},
			],
		});

		// render pass descriptors
		this.renderPassDescriptors.depthPass = {
			label: "depth pass descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.0, 0.0],
					loadOp: "clear",
					storeOp: "store",
					view: depthDrawView,
					resolveTarget: depthResolveView,
				},
			],
			depthStencilAttachment: {
				view: depthView,
				depthClearValue: 1.0,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			},
		};
		this.renderPassDescriptors.sceneDraw = {
			label: "output screen draw descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.0, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: sceneDrawView,
					resolveTarget: sceneResolveView,
				},
				{
					clearValue: [0.0, 0.0, 0.0, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: ssaoOutView,
					resolveTarget: ssaoResolveView,
				},
			],
			depthStencilAttachment: {
				view: depthView,
				depthLoadOp: "load",
				depthStoreOp: "discard",
			},
		};
		this.renderPassDescriptors.postFX = {
			label: "post processing draw descriptor",
			colorAttachments: [
				{
					clearValue: [0.0, 0.0, 0.0, 1.0],
					loadOp: "clear",
					storeOp: "store",
					view: screenOutputView,
					resolveTarget: this.ctx.getCurrentTexture().createView(),
				},
			],
		};
	}

	/**
	 * Called upon initialization and update to shadow settings
	 */
	private buildShadowRenderDescriptor() {
		// shadow depth texture used while rendering
		const depthTexture = this.device.createTexture({
			label: "shadow depth texture",
			size: [shadowSettings.resolution, shadowSettings.resolution, shadowSettings.cascades.length],
			format: "depth32float",
			dimension: "2d",
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});
		this.shadowData.texture = depthTexture;

		this.renderPassDescriptors.shadowPass = [];
		for (let i = 0; i < shadowSettings.cascades.length; i++) {
			this.renderPassDescriptors.shadowPass.push({
				label: `shadow pass descriptor - cascade #${i}`,
				colorAttachments: [],
				depthStencilAttachment: {
					view: depthTexture.createView({
						baseArrayLayer: i,
						arrayLayerCount: 1,
						dimension: "2d",
					}),
					depthClearValue: 1.0,
					depthLoadOp: "clear",
					depthStoreOp: "store",
				},
			});
		}
	}

	public onLightingLoad() {
		const skyData = this.sky.sceneRenderData;
		if (!skyData) {
			return;
		}

		// ssao uniform buffer
		const ssaoUniformBuffer = this.device.createBuffer({
			label: "ssao uniform buffer",
			size: ssaoSettings.sampleCount * 4 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		const ssaoBufferData = new Float32Array(ssaoSettings.sampleCount * 4).fill(0);
		let i = 0;
		while (i < ssaoSettings.sampleCount) {
			const sample = vec3.fromValues(Math.random() * 2.0 - 1.0, Math.random() * 2.0 - 1.0, Math.random());
			vec3.normalize(sample, sample);
			let scale = i / ssaoSettings.sampleCount;
			scale = 0.1 + scale * scale * (1.0 - 0.1);
			vec3.scale(sample, scale, sample);

			if (vec3.normalize(sample)[2] < ssaoSettings.kernelDotCutOff) {
				continue;
			}

			ssaoBufferData.set(sample, i * 4);
			i++;
		}
		new Float32Array(ssaoUniformBuffer.getMappedRange()).set(ssaoBufferData);
		ssaoUniformBuffer.unmap();
		const ssaoNoiseTexture = this.device.createTexture({
			label: "ssao noise texture",
			size: [ssaoSettings.noiseTextureSize, ssaoSettings.noiseTextureSize],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
			sampleCount: 1,
			textureBindingViewDimension: "2d",
		});
		const ssaoNoiseData = new Uint8Array(4 * ssaoSettings.noiseTextureSize * ssaoSettings.noiseTextureSize);
		for (let i = 0; i < ssaoNoiseData.length; i++) {
			ssaoNoiseData[i] = Math.random() * 255;
		}
		this.device.queue.writeTexture(
			{
				texture: ssaoNoiseTexture,
				mipLevel: 0,
				origin: { x: 0, y: 0, z: 0 },
			},
			ssaoNoiseData,
			{ bytesPerRow: 4 * ssaoSettings.noiseTextureSize, rowsPerImage: ssaoSettings.noiseTextureSize },
			{ width: ssaoSettings.noiseTextureSize, height: ssaoSettings.noiseTextureSize },
		);

		// lighting uniform buffer
		const lightingUniformBuffer = this.device.createBuffer({
			label: "lighting uniform buffer",
			size: 2 * 4 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		const lightingBufferData = new Float32Array(2 * 4);
		lightingBufferData.set(sunSettings.direction, 0);
		lightingBufferData.set(sunSettings.color, 4);
		lightingBufferData[7] = sunSettings.intensity;
		new Float32Array(lightingUniformBuffer.getMappedRange()).set(lightingBufferData);
		lightingUniformBuffer.unmap();

		const ssaoNoiseSampler = this.device.createSampler({
			minFilter: "nearest",
			magFilter: "nearest",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});

		const sceneSampler = this.device.createSampler({
			minFilter: "linear",
			magFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			addressModeW: "clamp-to-edge",
		});
		
		const shadowmapSampler = this.device.createSampler({
			compare: "less",
		});

		const sceneBindGroup = this.device.createBindGroup({
			label: "ssao bind group",
			layout: this.globalUniformBindGroupLayouts.scene,
			entries: [
				{
					binding: 0,
					resource: ssaoNoiseSampler,
				},
				{
					binding: 1,
					resource: ssaoNoiseTexture.createView(),
				},
				{
					binding: 2,
					resource: sceneSampler,
				},
				{
					binding: 3,
					resource: skyData.irradianceTexture.createView({
						dimension: "cube",
					}),
				},
				{
					binding: 4,
					resource: skyData.prefilterTexture.createView({
						dimension: "cube",
					}),
				},
				{
					binding: 5,
					resource: skyData.brdfTexture.createView(),
				},
				{
					binding: 6,
					resource: { buffer: ssaoUniformBuffer, offset: 0, size: ssaoSettings.sampleCount * 4 * 4 },
				},
				{
					binding: 7,
					resource: { buffer: lightingUniformBuffer, offset: 0, size: 2 * 4 * 4 },
				},
				{
					binding: 8,
					resource: shadowmapSampler,
				}
			],
		});
		this.globalUniformBindGroups.scene = sceneBindGroup;
	}

	public draw(input: Input, deltaTime: number) {
		// game logic
		{
			// rotate camera with mouse delta
			if (input.pointerLocked) {
				this.camera.yaw += input.dx * MOUSE_SENSITIVITY;
				this.camera.pitch = Math.min(
					Math.PI / 2 - 0.0001,
					Math.max(-Math.PI / 2 + 0.0001, this.camera.pitch - input.dy * MOUSE_SENSITIVITY),
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
		}

		// update camera
		this.camera.update(this.canvas);

		// update sun
		this.sky.update(this.camera);

		// update uniforms
		{
			// update camera buffer
			this.uniformBufferData.camera.set(this.camera.viewMatrix, 0);
			this.uniformBufferData.camera.set(this.camera.projMatrix, 16);
			this.uniformBufferData.camera.set(this.camera.position, 32);
			this.device.queue.writeBuffer(
				this.uniformBuffers.camera,
				0,
				this.uniformBufferData.camera.buffer,
				this.uniformBufferData.camera.byteOffset,
				this.uniformBufferData.camera.byteLength,
			);

			// update shadow camera buffer
			const cascadeBufferSize = 256 / 4;
			for (let i = 0; i < shadowSettings.cascades.length; i++) {
				this.uniformBufferData.shadows.set(this.camera.cascadeMatrices[i].view, i * cascadeBufferSize + 0);
				this.uniformBufferData.shadows.set(this.camera.cascadeMatrices[i].proj, i * cascadeBufferSize + 16);
				this.uniformBufferData.shadows[i * cascadeBufferSize + 32] = shadowSettings.cascades[i].depthScale;
				this.uniformBufferData.shadows[i * cascadeBufferSize + 33] = shadowSettings.cascades[i].bias;
				this.uniformBufferData.shadows[i * cascadeBufferSize + 34] = shadowSettings.cascades[i].normalBias;
				this.uniformBufferData.shadows[i * cascadeBufferSize + 35] = shadowSettings.cascades[i].pcfRadius;
				this.uniformBufferData.shadows[i * cascadeBufferSize + 36] = shadowSettings.cascades[i].near;
				this.uniformBufferData.shadows[i * cascadeBufferSize + 37] = shadowSettings.cascades[i].far;
			}
			this.device.queue.writeBuffer(
				this.uniformBuffers.shadows,
				0,
				this.uniformBufferData.shadows.buffer,
				this.uniformBufferData.shadows.byteOffset,
				this.uniformBufferData.shadows.byteLength,
			);

			// rot proj matrix for the skybox
			if (this.sky.skyboxRenderData) {
				this.device.queue.writeBuffer(
					this.sky.skyboxRenderData.cameraUniformBuffer,
					0,
					this.camera.rotProjMatrix.buffer,
					this.camera.rotProjMatrix.byteOffset,
					this.camera.rotProjMatrix.byteLength,
				);
			}
		}

		(this.renderPassDescriptors.postFX!.colorAttachments as any)[0].resolveTarget = this.ctx
			.getCurrentTexture()
			.createView();
		const encoder = this.device.createCommandEncoder({ label: "render encoder" });

		{
			// shadow pass
			for (let i = 0; i < shadowSettings.cascades.length; i++) {
				const shadowPass = encoder.beginRenderPass(this.renderPassDescriptors.shadowPass![i]);
				shadowPass.setPipeline(this.pipelines.shadows);
				shadowPass.setBindGroup(0, this.globalUniformBindGroups.shadows![i]);
				for (const model of this.objects) {
					shadowPass.setBindGroup(1, model.transformUniformBindGroup);
					shadowPass.setVertexBuffer(0, model.modelData.vertexBuffer);
					shadowPass.setIndexBuffer(model.modelData.indexBuffer, model.modelData.indexFormat);
					shadowPass.drawIndexed(model.modelData.indexCount);
				}
				shadowPass.end();
			}
		}

		{
			// depth prepass
			const depthPass = encoder.beginRenderPass(this.renderPassDescriptors.depthPass!);
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

		if (this.globalUniformBindGroups.scene) {
			// screen draw pass
			const drawPass = encoder.beginRenderPass(this.renderPassDescriptors.sceneDraw!);
			drawPass.setPipeline(this.pipelines.PBR);
			drawPass.setBindGroup(0, this.globalUniformBindGroups.camera);
			drawPass.setBindGroup(2, this.globalUniformBindGroups.depth);
			drawPass.setBindGroup(3, this.globalUniformBindGroups.scene);

			for (const model of this.objects) {
				drawPass.setBindGroup(1, model.transformUniformBindGroup);
				drawPass.setVertexBuffer(0, model.modelData.vertexBuffer);
				drawPass.setIndexBuffer(model.modelData.indexBuffer, model.modelData.indexFormat);
				drawPass.drawIndexed(model.modelData.indexCount);
			}

			if (this.sky.skyboxRenderData) {
				drawPass.setPipeline(this.sky.skyboxRenderData.pipeline);
				drawPass.setBindGroup(0, this.sky.skyboxRenderData.cameraBindGroup);
				drawPass.setBindGroup(1, this.sky.skyboxRenderData.textureBindGroup);
				drawPass.setVertexBuffer(0, this.sky.skyboxRenderData.vertexBuffer);
				drawPass.setIndexBuffer(this.sky.skyboxRenderData.indexBuffer, "uint16");
				drawPass.drawIndexed(36);
			}
			drawPass.end();
		}

		{
			// post processing pass
			const postFXPass = encoder.beginRenderPass(this.renderPassDescriptors.postFX!);
			postFXPass.setPipeline(this.pipelines.postFX);

			postFXPass.setBindGroup(0, this.globalUniformBindGroups.drawTexture);
			postFXPass.setVertexBuffer(0, this.postFXQuad.vertexBuffer);
			postFXPass.draw(5);
			postFXPass.end();
		}

		this.device.queue.submit([encoder.finish()]);
	}

	public onResize() {
		this.buildScreenRenderDescriptors();
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

	constructor(device: GPUDevice, camera: Camera, basicModelBindGroupLayout: GPUBindGroupLayout) {
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
			transform: new Transform(camera),
		};
	}

	public update(device: GPUDevice, camera: Camera, yPos: number) {
		const timestamp = performance.now() / 1000 + yPos * 0.1;
		this.modelData.transform.rotation.set([Math.sin(timestamp), Math.cos(timestamp), 0]);
		this.modelData.transform.position[1] = yPos;
		this.modelData.transform.update(camera);
		device.queue.writeBuffer(
			this.modelData.uniformBuffer,
			0,
			this.modelData.transform.matrix.buffer,
			this.modelData.transform.matrix.byteOffset,
			this.modelData.transform.matrix.byteLength,
		);
	}
}
