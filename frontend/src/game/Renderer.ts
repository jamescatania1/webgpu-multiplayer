import Camera from "./Camera";
import { mat4, vec2, vec3, vec4, type Mat4, type Vec2, type Vec3, type Vec4 } from "wgpu-matrix";
import type Input from "./Input";
import type { RenderContext } from "./Game";
import { loadShaders, type Shaders } from "./Shaders";
import Transform from "./Transform";
import Model, { loadBOBJ, type ModelData } from "./Model";
import Sky from "./Sky";
import { loadResources, type ResourceAtlas } from "./Resources";

const MAX_VEL = 1.0;
const ACCEL = 0.01;
const MOUSE_SENSITIVITY = 2.0;

export const DEBUG_GRAPHICS_TIME = true;
export const SSAO_SETTINGS = {
	sampleCount: 24,
	radius: 0.5,
	bias: 0.15,
	kernelDotCutOff: 0.025,
	noiseTextureSize: 32,
	noiseScale: 1000.0,
	fadeStart: 60.0,
	fadeEnd: 70.0,
	blurKernelSize: 4,
};
export const BLOOM_SETTINGS = {
	levels: 6,
	padding: 16,
	intensity: 1.0,
	radius: 0.85,
	threshold: 1.01,
};
export const SHADOW_SETTINGS = {
	debugCascades: false,
	resolution: 2048,
	kernelSize: 128,
	fadeDistance: 10.0,
	cascades: [
		{
			near: 0.1,
			far: 5.0,
			radius: 8.0,
			bias: 0.00017,
			normalBias: 0.15,
			samples: 32,
			blockerSamples: 24,
		},
		{
			near: 4.0,
			far: 15.0,
			radius: 5.0,
			bias: 0.00025,
			normalBias: 0.1,
			samples: 16,
			blockerSamples: 24,
		},
		{
			near: 13.0,
			far: 35.0,
			radius: 3.0,
			bias: 0.00035,
			normalBias: 0.15,
			samples: 8,
			blockerSamples: 16,
		},
		{
			near: 31.0,
			far: 100.0,
			radius: 1.0,
			bias: 0.00035,
			normalBias: 0.3,
			samples: 4,
			blockerSamples: 12,
		},
	],
};
export const SUN_SETTINGS = {
	position: vec3.fromValues(20, 50, -17),
	direction: vec3.normalize(vec3.fromValues(20, 50, -17)),
	color: vec3.normalize(vec3.fromValues(1, 240.0 / 255.0, 214.0 / 255.0)),
	intensity: 1.5,
};
export const SKY_SETTINGS = {
	ambientIntensity: 0.75,
	skyboxSource: "sky",
	skyboxResolution: 2048,
	irradianceResolution: 64,
	irradianceSampleDelta: 0.025,
	prefilterResolution: 256,
	prefilterMipLevels: 5,
	prefilterSamples: 2048,
	brdfResolution: 1024,
	brdfSamples: 2048,
	fogStart: 155.0,
	fogEnd: 255.0,
	fogMipLevel: 2.0,
	gammaOffset: 0.2,
};
export const POSTFX_SETTINGS = {
	exposure: 0.525,
	temperature: 0.2,
	tint: 0.1,
	contrast: 1.05,
	brightness: 0.0,
	gamma: 2.0,
	vignetteStart: 1.0,
	vignetteEnd: 1.5,
	vignetteIntensity: 0.25,
};
export const INSTANCE_BUFFER_ENTRY_SIZE = 144;
const DEFAULT_INSTANCE_BUFFER_SIZE = {
	static: 10 * INSTANCE_BUFFER_ENTRY_SIZE,
	dynamic: 10 * INSTANCE_BUFFER_ENTRY_SIZE,
};

type SceneObject = {
	model: Model;
	usage: "static" | "dynamic";
	instance: number;
};
type InstanceCollection = {
	model: ModelData;
	objects: SceneObject[];
	instanceBase: number;
	instanceCount: number;
	instanceBuffer: GPUBuffer;
	instanceData: Float32Array;
	cullBuffer: GPUBuffer;
	cullShadowBuffers: GPUBuffer[];
	indirectBuffer: GPUBuffer;
	indirectData: Uint32Array;
	instanceBindGroups: GPUBindGroup[];
	cullingBindGroup: GPUBindGroup;
};

export let renderWidth = 0;
export let renderHeight = 0;

export default class Renderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly device: GPUDevice;
	private readonly adapter: GPUAdapter;
	private readonly ctx: GPUCanvasContext;

	public timestampData: {
		querySet: GPUQuerySet;
		resolveBuffer: GPUBuffer;
		resultBuffer: GPUBuffer;
		debugPasses: (GPURenderPassDescriptor | GPUComputePassDescriptor)[];
		data: { [key: string]: number };
	} | null = null;
	private readonly uniformBuffers: {
		camera: GPUBuffer;
		shadows: GPUBuffer;
		bloomDownsample: {
			prefilterEnabled: GPUBuffer;
			prefilterDisabled: GPUBuffer;
		};
	};
	private readonly uniformBufferData: {
		camera: Float32Array;
		shadows: Float32Array;
	};
	private models: {
		static: {
			[key: string]: InstanceCollection;
		};
		dynamic: {
			[key: string]: InstanceCollection;
		};
	} = {
		static: {},
		dynamic: {},
	};
	private resources: ResourceAtlas | null = null;
	private globalUniformBindGroupLayouts: {
		camera: GPUBindGroupLayout;
		shadows: GPUBindGroupLayout;
		bloomDownsample: GPUBindGroupLayout;
		bloomUpsample: GPUBindGroupLayout;
		upsample: GPUBindGroupLayout;
		depth: GPUBindGroupLayout;
		scene: GPUBindGroupLayout;
		ssao: GPUBindGroupLayout;
		instance: GPUBindGroupLayout;
		instanceCulling: GPUBindGroupLayout;
	};
	private globalUniformBindGroups: {
		camera: GPUBindGroup | null;
		shadows: GPUBindGroup[];
		bloomDownsample: GPUBindGroup[] | null;
		bloomUpsample: GPUBindGroup[] | null;
		depth: GPUBindGroup | null;
		scene: GPUBindGroup | null;
		ssao: GPUBindGroup | null;
		ssaoBlurX: GPUBindGroup | null;
		ssaoBlurY: GPUBindGroup | null;
		ssaoBlurKernelX: GPUBindGroup | null;
		ssaoBlurKernelY: GPUBindGroup | null;
		ssaoUpscale: GPUBindGroup | null;
		drawTexture: GPUBindGroup | null;
	};
	private readonly pipelines: {
		PBR: GPURenderPipeline;
		depth: GPURenderPipeline;
		shadows: GPURenderPipeline;
		postFX: GPURenderPipeline;
		ssao: GPUComputePipeline;
		ssaoBlurX: GPUComputePipeline;
		ssaoBlurY: GPUComputePipeline;
		ssaoUpscale: GPUComputePipeline;
		bloomDownsample: GPUComputePipeline;
		bloomUpsample: GPUComputePipeline;
		culling: GPUComputePipeline;
	};
	private readonly renderBundleDescriptors: {
		sceneDraw: GPURenderBundleEncoderDescriptor;
		depth: GPURenderBundleEncoderDescriptor;
		shadows: GPURenderBundleEncoderDescriptor[];
	};
	private renderBundles: {
		sceneDraw: GPURenderBundle | null;
		depth: GPURenderBundle | null;
		shadows: (GPURenderBundle | null)[];
	};
	private renderPassDescriptors: {
		depthPass: GPURenderPassDescriptor;
		shadowPass: GPURenderPassDescriptor[];
		sceneDraw: GPURenderPassDescriptor;
		postFX: GPURenderPassDescriptor;
	};
	private computePassDescriptors: {
		ssao: GPUComputePassDescriptor;
		ssaoBlurX: GPUComputePassDescriptor;
		ssaoBlurY: GPUComputePassDescriptor;
		ssaoUpscale: GPUComputePassDescriptor;
		bloomDownsample: GPUComputePassDescriptor[];
		bloomUpsample: GPUComputePassDescriptor[];
		culling: GPUComputePassDescriptor;
	};
	private shadowData: {
		texture: GPUTexture | null;
	};
	private bloomLevels: {
		width: number;
		height: number;
	}[] = [];
	private readonly presentationFormat: GPUTextureFormat;

	private readonly shaders: Shaders;
	private readonly camera: Camera;
	private sky: Sky | null = null;
	private objects: SceneObject[] = [];
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

		(renderWidth = this.canvas.width + BLOOM_SETTINGS.padding * 2),
			(renderHeight = this.canvas.height + BLOOM_SETTINGS.padding * 2),
			(this.camera = new Camera(canvas));
		this.camera.position[1] = 5.0;
		this.camera.position[2] = 25.0;

		this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this.ctx.configure({
			device: this.device,
			format: this.presentationFormat,
		});

		this.shadowData = {
			texture: null,
		};

		// uniform bind group layouts
		const cameraBindGroupLayout = this.device.createBindGroupLayout({
			label: "camera data bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
					buffer: {},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
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
					sampler: {
						type: "non-filtering",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						viewDimension: "2d-array",
						sampleType: "depth",
					},
				},
				{
					// screen size, can move elsewhere later
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: {},
				},
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						viewDimension: "2d",
						multisampled: false,
						sampleType: "float",
					},
				},
			],
		});
		const sceneBindGroupLayout = this.device.createBindGroupLayout({
			label: "scene render bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
					sampler: {},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
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
					visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
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
					},
				},
				{
					binding: 9,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {
						type: "non-filtering",
					},
				},
				{
					binding: 10,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: {
						type: "read-only-storage",
					},
				},
				{
					binding: 11,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						multisampled: false,
						sampleType: "float",
						viewDimension: "2d",
					},
				},
				{
					binding: 12,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {
						type: "filtering",
					},
				},
			],
		});
		const ssaoBindGroupLayout = this.device.createBindGroupLayout({
			label: "ssao bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						viewDimension: "2d",
						multisampled: true,
						sampleType: "depth",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						viewDimension: "2d",
						multisampled: true,
						sampleType: "unfilterable-float",
					},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					storageTexture: {
						access: "write-only",
						format: "rgba16float",
						viewDimension: "2d",
					},
				},
			],
		});
		const bloomDownsampleBindGroupLayout = this.device.createBindGroupLayout({
			label: "bloom downsample bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						viewDimension: "2d",
						multisampled: false,
						sampleType: "float",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					sampler: {
						type: "filtering",
					},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					storageTexture: {
						access: "write-only",
						format: "rgba16float",
						viewDimension: "2d",
					},
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {},
				},
			],
		});
		const bloomUpsampleBindGroupLayout = this.device.createBindGroupLayout({
			label: "bloom upsample bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						viewDimension: "2d",
						multisampled: false,
						sampleType: "float",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						viewDimension: "2d",
						multisampled: false,
						sampleType: "float",
					},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					sampler: {
						type: "filtering",
					},
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					storageTexture: {
						access: "write-only",
						format: "rgba16float",
						viewDimension: "2d",
					},
				},
				{
					binding: 4,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {},
				},
			],
		});
		const upsampleBindGroupLayout = this.device.createBindGroupLayout({
			label: "upsample bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					texture: {
						viewDimension: "2d",
						multisampled: false,
						sampleType: "float",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					sampler: {
						type: "filtering",
					},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					storageTexture: {
						access: "write-only",
						format: "rgba16float",
						viewDimension: "2d",
					},
				},
			],
		});
		const instanceBindGroupLayout = this.device.createBindGroupLayout({
			label: "instance bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: {
						type: "read-only-storage",
						minBindingSize: INSTANCE_BUFFER_ENTRY_SIZE,
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.VERTEX,
					buffer: {
						type: "read-only-storage",
					},
				},
			],
		});
		const instanceCullingBindGroupLayout = this.device.createBindGroupLayout({
			label: "instance culling bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "read-only-storage",
						minBindingSize: INSTANCE_BUFFER_ENTRY_SIZE,
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
				{
					binding: 4,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
				{
					binding: 5,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
				{
					binding: 6,
					visibility: GPUShaderStage.COMPUTE,
					buffer: {
						type: "storage",
					},
				},
			],
		});
		this.globalUniformBindGroupLayouts = {
			camera: cameraBindGroupLayout,
			shadows: shadowsBindGroupLayout,
			depth: depthBindGroupLayout,
			scene: sceneBindGroupLayout,
			ssao: ssaoBindGroupLayout,
			bloomDownsample: bloomDownsampleBindGroupLayout,
			bloomUpsample: bloomUpsampleBindGroupLayout,
			upsample: upsampleBindGroupLayout,
			instance: instanceBindGroupLayout,
			instanceCulling: instanceCullingBindGroupLayout,
		};

		// pipelines for drawing the pbr scene models
		const depthPrepassPipelineLayout = this.device.createPipelineLayout({
			label: "depth prepass layout",
			bindGroupLayouts: [this.globalUniformBindGroupLayouts.instance, this.globalUniformBindGroupLayouts.camera],
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
				targets: [
					{
						format: "rgba16float",
					},
				],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: {
				depthWriteEnabled: true,
				depthCompare: "less",
				format: "depth32float",
			},
			multisample: {
				count: 4,
			},
		});
		const shadowDepthPipelineLayout = this.device.createPipelineLayout({
			label: "shadow pass layout",
			bindGroupLayouts: [this.globalUniformBindGroupLayouts.instance, this.globalUniformBindGroupLayouts.shadows],
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
				this.globalUniformBindGroupLayouts.instance,
				this.globalUniformBindGroupLayouts.camera,
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
				targets: [{ format: "rgba16float" }],
				constants: {
					// near: this.camera.near,
					// far: this.camera.far,
					ambient_intensity: SKY_SETTINGS.ambientIntensity,
					debug_cascades: SHADOW_SETTINGS.debugCascades ? 1 : 0,
					shadow_fade_distance: SHADOW_SETTINGS.fadeDistance,
					fog_start: SKY_SETTINGS.fogStart,
					fog_end: SKY_SETTINGS.fogEnd,
					fog_mip_level: SKY_SETTINGS.fogMipLevel,
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
				constants: {
					padding: BLOOM_SETTINGS.padding,
				},
			},
			fragment: {
				module: this.shaders.postFX,
				entryPoint: "fs",
				targets: [{ format: this.presentationFormat }],
				constants: {
					exposure: POSTFX_SETTINGS.exposure,
					temperature: POSTFX_SETTINGS.temperature,
					tint: POSTFX_SETTINGS.tint,
					contrast: POSTFX_SETTINGS.contrast,
					brightness: POSTFX_SETTINGS.brightness,
					gamma: POSTFX_SETTINGS.gamma,
					vignette_start: POSTFX_SETTINGS.vignetteStart,
					vignette_end: POSTFX_SETTINGS.vignetteEnd,
					vignette_intensity: POSTFX_SETTINGS.vignetteIntensity,
				},
			},
			primitive: {
				topology: "triangle-strip",
				cullMode: "back",
			},
			multisample: {
				count: 4,
			},
		});
		const ssaoPipelineLayout = this.device.createPipelineLayout({
			label: "ssao compute pipeline layout",
			bindGroupLayouts: [
				this.globalUniformBindGroupLayouts.ssao,
				this.globalUniformBindGroupLayouts.scene,
				this.globalUniformBindGroupLayouts.camera,
			],
		});
		const ssaoComputePipeline = this.device.createComputePipeline({
			label: "irradiance map generator compute pipeline",
			layout: ssaoPipelineLayout,
			compute: {
				module: this.shaders.ssao,
				entryPoint: "compute_ssao",
				constants: {
					ssao_samples: SSAO_SETTINGS.sampleCount,
					ssao_radius: SSAO_SETTINGS.radius,
					ssao_bias: SSAO_SETTINGS.bias,
					ssao_noise_scale: SSAO_SETTINGS.noiseScale,
					ssao_fade_start: SSAO_SETTINGS.fadeStart,
					ssao_fade_end: SSAO_SETTINGS.fadeEnd,
				},
			},
		});
		const ssaoBlurXComputePipeline = this.device.createComputePipeline({
			label: "ssao horizontal blur compute pipeline",
			layout: "auto",
			compute: {
				module: this.shaders.ssaoBlur,
				entryPoint: "compute_ssao_blur",
				constants: {
					kernel_size: SSAO_SETTINGS.blurKernelSize,
					blur_x: 1.0,
					blur_y: 0.0,
				},
			},
		});
		const ssaoBlurYComputePipeline = this.device.createComputePipeline({
			label: "ssao vertical blur compute pipeline",
			layout: "auto",
			compute: {
				module: this.shaders.ssaoBlur,
				entryPoint: "compute_ssao_blur",
				constants: {
					kernel_size: SSAO_SETTINGS.blurKernelSize,
					blur_x: 0.0,
					blur_y: 1.0,
				},
			},
		});
		const ssaoUpscalePipeline = this.device.createComputePipeline({
			label: "ssao upscale compute pipeline",
			layout: "auto",
			compute: {
				module: this.shaders.upsample,
				entryPoint: "compute_upsample",
			},
		});
		const bloomDownsamplePipelineLayout = this.device.createPipelineLayout({
			label: "bloom downsample layout",
			bindGroupLayouts: [this.globalUniformBindGroupLayouts.bloomDownsample],
		});
		const bloomDownsamplePipeline = this.device.createComputePipeline({
			label: "bloom downsample compute pipeline",
			layout: bloomDownsamplePipelineLayout,
			compute: {
				module: this.shaders.bloomDownsample,
				entryPoint: "compute_downsample",
				constants: {
					threshold: BLOOM_SETTINGS.threshold,
				},
			},
		});
		const bloomUpsamplePipelineLayout = this.device.createPipelineLayout({
			label: "bloom upsample layout",
			bindGroupLayouts: [this.globalUniformBindGroupLayouts.bloomUpsample],
		});
		const bloomUpsamplePipeline = this.device.createComputePipeline({
			label: "bloom upsample compute pipeline",
			layout: bloomUpsamplePipelineLayout,
			compute: {
				module: this.shaders.bloomUpsample,
				entryPoint: "compute_upsample",
				constants: {
					intensity: BLOOM_SETTINGS.intensity,
					radius: BLOOM_SETTINGS.radius,
				},
			},
		});
		const cullPipelineLayout = this.device.createPipelineLayout({
			label: "culling layout",
			bindGroupLayouts: [
				this.globalUniformBindGroupLayouts.instanceCulling,
				this.globalUniformBindGroupLayouts.camera,
			],
		});
		const cullPipeline = this.device.createComputePipeline({
			label: "culling pipeline",
			layout: cullPipelineLayout,
			compute: {
				module: this.shaders.culling,
				entryPoint: "compute_culling",
			},
		});

		this.pipelines = {
			depth: depthPrepassRenderPipeline,
			shadows: shadowDepthRenderPipeline,
			PBR: PBRRenderPipeline,
			postFX: postFXPipeline,
			ssao: ssaoComputePipeline,
			ssaoBlurX: ssaoBlurXComputePipeline,
			ssaoBlurY: ssaoBlurYComputePipeline,
			ssaoUpscale: ssaoUpscalePipeline,
			bloomDownsample: bloomDownsamplePipeline,
			bloomUpsample: bloomUpsamplePipeline,
			culling: cullPipeline,
		};

		const cascadeBufferSizeBytes = 256;
		this.uniformBuffers = {
			camera: this.device.createBuffer({
				label: "camera uniform buffer",
				size: 256 + 64,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			}),
			shadows: this.device.createBuffer({
				label: "shadow cascades uniform buffer",
				size: SHADOW_SETTINGS.cascades.length * cascadeBufferSizeBytes,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			}),
			bloomDownsample: {
				prefilterEnabled: this.device.createBuffer({
					label: "bloom downsample filter-enabled buffer",
					size: 4,
					usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
					mappedAtCreation: true,
				}),
				prefilterDisabled: this.device.createBuffer({
					label: "bloom downsample filter-disabled buffer",
					size: 4,
					usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
					mappedAtCreation: true,
				}),
			},
		};
		this.uniformBufferData = {
			camera: new Float32Array(this.uniformBuffers.camera.size / 4),
			shadows: new Float32Array(this.uniformBuffers.shadows.size / 4),
		};

		new Int32Array(this.uniformBuffers.bloomDownsample.prefilterEnabled.getMappedRange())[0] = 1;
		this.uniformBuffers.bloomDownsample.prefilterEnabled.unmap();
		new Int32Array(this.uniformBuffers.bloomDownsample.prefilterDisabled.getMappedRange())[0] = 0;
		this.uniformBuffers.bloomDownsample.prefilterDisabled.unmap();

		const cameraBindGroup = this.device.createBindGroup({
			layout: this.globalUniformBindGroupLayouts.camera,
			entries: [
				{
					binding: 0,
					resource: {
						buffer: this.uniformBuffers.camera,
						offset: 0,
						size: 36 * 4,
					},
				},
				{
					binding: 1,
					resource: {
						buffer: this.uniformBuffers.camera,
						offset: 256,
						size: 16 * 4,
					},
				},
				{
					binding: 2,
					resource: {
						buffer: this.uniformBuffers.shadows,
						offset: 0,
						size: this.uniformBuffers.shadows.size,
					},
				},
			],
		});
		const shadowBindGroups = [];
		for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
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
						},
					],
				}),
			);
		}

		// ssao blur kernel bind group
		const kernelData = [];
		const kernelOffsets = [];
		const sigma = 8.0;
		let intensity = 0;
		for (let i = -SSAO_SETTINGS.blurKernelSize; i <= SSAO_SETTINGS.blurKernelSize; i++) {
			const gaussian =
				(1.0 / Math.sqrt(2.0 * Math.PI * sigma * sigma)) * Math.exp(-(i * i) / (2.0 * sigma * sigma));

			intensity += gaussian;
			kernelData.push(gaussian);
			kernelOffsets.push(i);
		}
		const interpKernelData = [];
		const interpKernelOffsets = [];
		let i = 0;
		while (i + 1 < kernelData.length) {
			const texA = kernelData[i];
			const texB = kernelData[i + 1];
			const alpha = texA / (texA + texB);
			interpKernelData.push((texA + texB) / intensity);
			interpKernelOffsets.push(alpha + kernelOffsets[i]);
			i += 2;
		}
		if (i < kernelData.length) {
			interpKernelData.push(kernelData[i] / intensity);
			interpKernelOffsets.push(kernelOffsets[i]);
		}
		const kernelBuffer = this.device.createBuffer({
			label: "ssao blur kernel buffer",
			size: interpKernelData.length * 2 * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		const kernelBufferData = new Float32Array(kernelBuffer.getMappedRange());
		for (let i = 0; i < interpKernelData.length; i++) {
			kernelBufferData[i * 2] = interpKernelData[i];
			kernelBufferData[i * 2 + 1] = interpKernelOffsets[i];
		}
		kernelBuffer.unmap();
		const ssaoBlurXKernelBindGroup = this.device.createBindGroup({
			layout: ssaoBlurXComputePipeline.getBindGroupLayout(1),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: kernelBuffer,
					},
				},
			],
		});
		const ssaoBlurYKernelBindGroup = this.device.createBindGroup({
			layout: ssaoBlurYComputePipeline.getBindGroupLayout(1),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: kernelBuffer,
					},
				},
			],
		});

		this.globalUniformBindGroups = {
			camera: cameraBindGroup,
			shadows: shadowBindGroups,
			ssaoBlurKernelX: ssaoBlurXKernelBindGroup,
			ssaoBlurKernelY: ssaoBlurYKernelBindGroup,
			// depend on the lighting load state, and is created in onLightingLoad
			scene: null,
			// depend on the screen size, and are created in buildScreenRenderDescriptors
			depth: null,
			ssao: null,
			ssaoBlurX: null,
			ssaoBlurY: null,
			ssaoUpscale: null,
			bloomDownsample: null,
			bloomUpsample: null,
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
			depthPass: {
				label: "Depth Pass",
				colorAttachments: [],
				depthStencilAttachment: undefined,
			},
			sceneDraw: {
				label: "Scene Pass",
				colorAttachments: [],
				depthStencilAttachment: undefined,
			},
			postFX: {
				label: "Post FX Pass",
				colorAttachments: [],
			},
			shadowPass: [],
		};
		for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
			this.renderPassDescriptors.shadowPass.push({
				label: `Shadow Pass ${i + 1}`,
				colorAttachments: [],
				depthStencilAttachment: undefined,
			});
		}

		// create the shadow mapping textures and pass descriptor
		this.buildShadowRenderDescriptor();
		// create the output textures and render pass descriptor
		this.buildScreenRenderDescriptors();

		this.renderBundleDescriptors = {
			sceneDraw: {
				label: "Scene Pass Encoder",
				colorFormats: ["rgba16float"],
				depthReadOnly: true,
				depthStencilFormat: "depth32float",
				sampleCount: 4,
			},
			depth: {
				label: "Depth Pass Encoder",
				colorFormats: ["rgba16float"],
				depthReadOnly: false,
				depthStencilFormat: "depth32float",
				sampleCount: 4,
			},
			shadows: [],
		};
		this.renderBundles = {
			sceneDraw: null,
			depth: null,
			shadows: [],
		};
		for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
			this.renderBundleDescriptors.shadows.push({
				label: `Shadow Pass ${i} Encoder`,
				colorFormats: [],
				depthReadOnly: false,
				depthStencilFormat: "depth32float",
				sampleCount: 1,
			});
			this.renderBundles.shadows.push(null);
		}

		this.computePassDescriptors = {
			ssao: {
				label: "SSAO Pass",
			},
			ssaoBlurX: {
				label: "SSAO Blur Pass X",
			},
			ssaoBlurY: {
				label: "SSAO Blur Pass Y",
			},
			ssaoUpscale: {
				label: "SSAO Upscale Pass",
			},
			culling: {
				label: "Frustum Culling",
			},
			bloomDownsample: [],
			bloomUpsample: [],
		};
		for (let i = 0; i < BLOOM_SETTINGS.levels; i++) {
			this.computePassDescriptors.bloomDownsample.push({
				label: `Bloom Downsample Pass ${i}`,
			});
			this.computePassDescriptors.bloomUpsample.push({
				label: `Bloom Upsample Pass ${i}`,
			});
		}

		// this.instances = this.buildInstanceBuffers();

		if (context.timestampQuery) {
			this.buildDebugBuffers();
		} else {
			this.timestampData = null;
		}

		loadResources(this.device).then((atlas) => {
			this.resources = atlas;
			this.loadScene();
		});
	}

	private loadScene() {
		if (!this.resources) {
			return;
		}

		this.sky = new Sky(this.device, this.resources.sky, this.shaders);
		this.onLightingLoad();

		// this.addObject(new Model({
		// 	mesh: this.resources.city,
		// 	visibility: ModelVisibility.ALL,
		// }), "static");
		this.addObject(
			new Model({
				mesh: this.resources.city,
				castShadows: false,
			}),
			"static",
		);

		for (let i = 0; i < 500; i++) {
			const mesh = new Model({
				mesh: Math.random() < 0.2 ? this.resources.monke : this.resources.cube,
				castShadows: true,
			});
			const obj = this.addObject(mesh, "dynamic");
			obj.model.transform.position[0] = (Math.random() - 0.5) * 300.0;
			obj.model.transform.position[1] = (Math.random() - 0.5) * 300.0;
			obj.model.transform.position[2] = (Math.random() - 0.5) * 300.0;
			obj.model.update();
		}

		this.updateRenderBundles();
		this.updateInstanceBufferData("static");
		this.updateInstanceBufferData("dynamic");
	}

	/**
	 * Adds an object to the scene.
	 * @param modelData the model mesh data.
	 * @param dynamic if true, the model's transform buffer is updated each frame.
	 * @returns the added object.
	 */
	public addObject(model: Model, usage: "static" | "dynamic"): SceneObject {
		let collection = this.models[usage][model.modelData.name];
		if (!collection || collection.instanceCount >= collection.instanceBuffer.size / INSTANCE_BUFFER_ENTRY_SIZE) {
			let instanceBufferSize = collection
				? collection.instanceBuffer.size * 2
				: (DEFAULT_INSTANCE_BUFFER_SIZE as any)[usage];

			const instanceBuffer = this.device.createBuffer({
				label: `${usage} ${model.modelData.name} instance buffer`,
				size: instanceBufferSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			});
			const instanceData = new Float32Array(instanceBufferSize / 4);
			if (collection) {
				instanceData.set(collection.instanceData);
			}
			const cullBuffer = this.device.createBuffer({
				label: `${usage} ${model.modelData.name} instance cull buffer`,
				size: (instanceBufferSize / INSTANCE_BUFFER_ENTRY_SIZE) * 4,
				usage: GPUBufferUsage.STORAGE,
			});
			const cullShadowBuffer = [];
			for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
				cullShadowBuffer.push(
					this.device.createBuffer({
						label: `${usage} ${model.modelData.name} shadow ${i + 1} instance cull buffer`,
						size: (instanceBufferSize / INSTANCE_BUFFER_ENTRY_SIZE) * 4,
						usage: GPUBufferUsage.STORAGE,
					}),
				);
			}
			const indirectBuffer = collection
				? collection.indirectBuffer
				: this.device.createBuffer({
						label: `${usage} ${model.modelData.name} instance indirect buffer`,
						size: 20 * (1 + SHADOW_SETTINGS.cascades.length),
						usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
					});
			const indirectData = collection ? collection.indirectData : new Uint32Array(indirectBuffer.size / 4);

			const instanceBindGroup = [];
			for (let i = 0; i <= SHADOW_SETTINGS.cascades.length; i++) {
				const cullBufferResource = i === 0 ? cullBuffer : cullShadowBuffer[i - 1];
				instanceBindGroup.push(
					this.device.createBindGroup({
						label: `${usage} ${model.modelData.name} instance bind group`,
						layout: this.globalUniformBindGroupLayouts.instance,
						entries: [
							{
								binding: 0,
								resource: {
									label: `${usage} ${model.modelData.name} instance buffer resource`,
									buffer: instanceBuffer,
									offset: 0,
									size: instanceBuffer.size,
								},
							},
							{
								binding: 1,
								resource: {
									label: `${usage} ${model.modelData.name} culled instance buffer resource ${i}`,
									buffer: cullBufferResource,
									offset: 0,
									size: cullBufferResource.size,
								},
							},
						],
					}),
				);
			}
			const cullingBindGroup = this.device.createBindGroup({
				label: `${usage} ${model.modelData.name} instance bind group`,
				layout: this.globalUniformBindGroupLayouts.instanceCulling,
				entries: [
					{
						binding: 0,
						resource: {
							label: `${usage} ${model.modelData.name} instance buffer resource`,
							buffer: instanceBuffer,
							offset: 0,
							size: instanceBuffer.size,
						},
					},
					{
						binding: 1,
						resource: {
							label: `${usage} ${model.modelData.name} culled instance buffer resource`,
							buffer: cullBuffer,
							offset: 0,
							size: cullBuffer.size,
						},
					},
					...cullShadowBuffer.map((buffer, i) => ({
						binding: 2 + i,
						resource: {
							label: `${usage} ${model.modelData.name} culled shadow ${i + 1} instance buffer resource`,
							buffer: buffer,
							offset: 0,
							size: buffer.size,
						},
					})),
					{
						binding: 2 + cullShadowBuffer.length,
						resource: {
							label: `${usage} ${model.modelData.name} indirect command buffer resource`,
							buffer: indirectBuffer,
							offset: 0,
							size: indirectBuffer.size,
						},
					},
				],
			});

			if (!collection) {
				collection = {
					model: model.modelData,
					instanceBase: -69,
					instanceCount: 0,
					objects: [],
					instanceBuffer: instanceBuffer,
					instanceData: instanceData,
					cullBuffer: cullBuffer,
					cullShadowBuffers: cullShadowBuffer,
					indirectBuffer: indirectBuffer,
					indirectData: indirectData,
					instanceBindGroups: instanceBindGroup,
					cullingBindGroup: cullingBindGroup,
				};
				this.models[usage][model.modelData.name] = collection;
			} else {
				collection.instanceData = instanceData;
				collection.instanceBuffer = instanceBuffer;
				collection.cullBuffer = cullBuffer;
				collection.cullShadowBuffers = cullShadowBuffer;
				collection.indirectBuffer = indirectBuffer;
				collection.instanceBindGroups = instanceBindGroup;
				collection.cullingBindGroup = cullingBindGroup;
			}
		}

		const object: SceneObject = {
			model: model,
			usage: usage,
			instance: collection.instanceCount++,
		};
		this.objects.push(object);
		collection.objects.push(object);

		for (let i = 0; i <= SHADOW_SETTINGS.cascades.length; i++) {
			collection.indirectData.set([model.modelData.indexCount, collection.instanceCount, 0, 0, 0], i * 5);
		}

		this.device.queue.writeBuffer(collection.indirectBuffer, 0, collection.indirectData);

		model.update();
		return object;
	}

	/**
	 * Removes an object from the scene.
	 * @param object the scene object to be removed.
	 */
	public removeObject(object: SceneObject) {
		if (!object) {
			return;
		}
		// const index = this.objects.indexOf(object);
		// if (index < 0) {
		// 	console.error("Tried to unregister dangling object", object);
		// 	return;
		// }
		// this.objects.splice(index, 1);

		// const entityCollection = object.dynamic ? this.renderEntities.dynamic : this.renderEntities.static;
		// const entityIndex = entityCollection.objects.indexOf(object);
		// if (entityIndex < 0) {
		// 	console.error("Tried to unregister dangling entity object", object);
		// 	return;
		// }
		// entityCollection.objects.splice(entityIndex, 1);
		// entityCollection.bufferFreeList.push(object.transformIndex);
	}

	// private buildInstanceBuffers(): {
	// 	static: InstanceClass;
	// 	dynamic: InstanceClass;
	// } {
	// 	const res: { [key: string]: InstanceClass } = {};
	// 	for (const usage of ["static", "dynamic"]) {
	// 		const instanceBuffer = this.device.createBuffer({
	// 			label: `${usage} instance buffer`,
	// 			size: (DEFAULT_INSTANCE_BUFFER_SIZE as any)[usage],
	// 			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	// 		});
	// 		res[usage] = {
	// 			buffer: instanceBuffer,
	// 			bindGroup: this.device.createBindGroup({
	// 				label: `${usage} instance bind group`,
	// 				layout: this.globalUniformBindGroupLayouts.instance,
	// 				entries: [
	// 					{
	// 						binding: 0,
	// 						resource: {
	// 							label: `${usage} instance buffer resource`,
	// 							buffer: instanceBuffer,
	// 							offset: 0,
	// 							size: instanceBuffer.size,
	// 						},
	// 					},
	// 				],
	// 			}),
	// 			data: new Float32Array(instanceBuffer.size / 4),
	// 			count: 0,
	// 		};
	// 	}
	// 	return res as any;
	// }
	zz = false;

	private updateInstanceBufferData(usage: "static" | "dynamic") {
		const collections = this.models[usage];
		if (!collections) {
			return;
		}
		const stride = INSTANCE_BUFFER_ENTRY_SIZE / 4;
		for (const collection of Object.values(collections)) {
			collection.instanceData.fill(0);
			for (const obj of collection.objects) {
				collection.instanceData.set(obj.model.transform.matrix, obj.instance * stride);
				collection.instanceData.set(obj.model.transform.normalMatrix, obj.instance * stride + 16);
				collection.instanceData.set(obj.model.modelData.offset, obj.instance * stride + 28);
				collection.instanceData.set(obj.model.modelData.scale, obj.instance * stride + 32);
				collection.instanceData[obj.instance * stride + 35] = obj.model.castShadows ? 1 : 0;
				// collection.instanceData.set(new Float32Array(cullMask), obj.instance * stride + 35);
			}
			this.device.queue.writeBuffer(
				collection.instanceBuffer,
				0,
				collection.instanceData.buffer,
				collection.instanceData.byteOffset,
				collection.instanceData.byteLength,
			);
		}
	}

	private buildDebugBuffers() {
		const passes = [];
		for (const descriptor of [
			...Object.values(this.renderPassDescriptors),
			...Object.values(this.computePassDescriptors),
		]) {
			if (!descriptor) {
				continue;
			}
			if (Symbol.iterator in descriptor) {
				for (const desc of descriptor) {
					passes.push(desc);
				}
			} else {
				passes.push(descriptor);
			}
		}

		const querySet = this.device.createQuerySet({
			type: "timestamp",
			count: 2 * passes.length,
		});
		const resolveBuffer = this.device.createBuffer({
			size: querySet.count * 8,
			usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
		});
		const resultBuffer = this.device.createBuffer({
			size: resolveBuffer.size,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});
		this.timestampData = {
			querySet: querySet,
			resolveBuffer: resolveBuffer,
			resultBuffer: resultBuffer,
			debugPasses: passes,
			data: {
				...Object.fromEntries(
					passes
						.filter((pass) => !pass.label?.startsWith("Bloom") && !pass.label?.startsWith("SSAO"))
						.map((desc, i) => [desc.label, 0]),
				),
				"SSAO Pass": 0,
				"Bloom Pass": 0,
			},
		};

		for (let i = 0; i < passes.length; i++) {
			passes[i].timestampWrites = {
				querySet: querySet,
				beginningOfPassWriteIndex: i * 2,
				endOfPassWriteIndex: i * 2 + 1,
			};
		}
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
			size: [renderWidth, renderHeight],
			sampleCount: 4,
			format: "depth32float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});

		const normalTexture = this.device.createTexture({
			label: "depth pass view normal texture",
			size: [renderWidth, renderHeight],
			sampleCount: 4,
			format: "rgba16float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});

		// scene draw color texture
		const sceneDrawTexture = this.device.createTexture({
			label: "scene draw texture",
			size: [renderWidth, renderHeight],
			sampleCount: 4,
			format: "rgba16float",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const sceneDrawView = sceneDrawTexture.createView();

		// resolve texture for post-processing output
		const sceneResolveTexture = this.device.createTexture({
			label: "scene single-sample resolve texture",
			size: [renderWidth, renderHeight],
			sampleCount: 1,
			format: "rgba16float",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const sceneResolveView = sceneResolveTexture.createView();

		// ssao output texture
		const ssaoResolution = [Math.ceil(renderWidth / 2), Math.ceil(renderHeight / 2)];
		const ssaoTexture = this.device.createTexture({
			label: "ssao texture",
			size: ssaoResolution,
			sampleCount: 1,
			format: "rgba16float",
			dimension: "2d",
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
		});

		const ssaoBlurXTexture = this.device.createTexture({
			label: "ssao blur texture",
			size: ssaoResolution,
			sampleCount: 1,
			format: "rgba16float",
			dimension: "2d",
			usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
		});

		// resolve texture for ssao output
		const ssaoUpscaleTexture = this.device.createTexture({
			label: "ssao upscale texture",
			size: [renderWidth, renderHeight],
			sampleCount: 1,
			format: "rgba16float",
			usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
		});

		// screen postfx ouptut color texture
		const screenOutputTexture = this.device.createTexture({
			label: "post fx screen output texture",
			size: [this.canvas.width, this.canvas.height],
			sampleCount: 4,
			format: this.presentationFormat,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		const screenOutputView = screenOutputTexture.createView();

		// bloom textures
		this.bloomLevels = [];
		let bloomTextureSize = [renderWidth, renderHeight];
		for (let i = 0; i <= BLOOM_SETTINGS.levels; i++) {
			this.bloomLevels.push({
				width: bloomTextureSize[0],
				height: bloomTextureSize[1],
			});
			bloomTextureSize = [Math.ceil(bloomTextureSize[0] / 2), Math.ceil(bloomTextureSize[1] / 2)];
		}
		const bloomTexture = this.device.createTexture({
			label: "bloom texture",
			size: [renderWidth, renderHeight],
			sampleCount: 1,
			format: "rgba16float",
			dimension: "2d",
			usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
			mipLevelCount: BLOOM_SETTINGS.levels + 1,
		});
		const bloomOutTexture = this.device.createTexture({
			label: "bloom upsample texture",
			size: [renderWidth, renderHeight],
			sampleCount: 1,
			format: "rgba16float",
			dimension: "2d",
			usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
			mipLevelCount: BLOOM_SETTINGS.levels + 1,
		});

		const depthUniformScreenSizeBuffer = this.device.createBuffer({
			size: 2 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(depthUniformScreenSizeBuffer.getMappedRange()).set([renderWidth, renderHeight]);
		depthUniformScreenSizeBuffer.unmap();

		// bind group for the depth texture
		this.globalUniformBindGroups.depth = this.device.createBindGroup({
			label: "depth texture bind group",
			layout: this.globalUniformBindGroupLayouts.depth,
			entries: [
				{
					binding: 0,
					resource: this.device.createSampler({
						minFilter: "nearest",
						magFilter: "nearest",
						addressModeU: "clamp-to-edge",
						addressModeV: "clamp-to-edge",
					}),
				},
				{
					binding: 1,
					resource: this.shadowData.texture.createView({
						dimension: "2d-array",
					}),
				},
				{
					binding: 2,
					resource: {
						buffer: depthUniformScreenSizeBuffer,
						offset: 0,
						size: 2 * 4,
					},
				},
				{
					binding: 3,
					resource: ssaoUpscaleTexture.createView(),
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
					resource: bloomOutTexture.createView({
						dimension: "2d",
						baseMipLevel: 0,
						mipLevelCount: 1,
					}),
				},
			],
		});

		this.globalUniformBindGroups.ssao = this.device.createBindGroup({
			label: "ssao bind group",
			layout: this.pipelines.ssao.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: depthTexture.createView(),
				},
				{
					binding: 1,
					resource: normalTexture.createView(),
				},
				{
					binding: 2,
					resource: ssaoTexture.createView(),
				},
			],
		});

		const filterSampler = this.device.createSampler({
			minFilter: "linear",
			magFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});

		this.globalUniformBindGroups.ssaoBlurX = this.device.createBindGroup({
			label: "ssao horizontal blur bind group",
			layout: this.pipelines.ssaoBlurX.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: ssaoTexture.createView(),
				},
				{
					binding: 1,
					resource: filterSampler,
				},
				{
					binding: 2,
					resource: ssaoBlurXTexture.createView(),
				},
			],
		});

		this.globalUniformBindGroups.ssaoBlurY = this.device.createBindGroup({
			label: "ssao vertical blur bind group",
			layout: this.pipelines.ssaoBlurY.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: ssaoBlurXTexture.createView(),
				},
				{
					binding: 1,
					resource: filterSampler,
				},
				{
					binding: 2,
					resource: ssaoTexture.createView(),
				},
			],
		});

		this.globalUniformBindGroups.ssaoUpscale = this.device.createBindGroup({
			label: "ssao upscale bind group",
			layout: this.pipelines.ssaoUpscale.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: ssaoTexture.createView(),
				},
				{
					binding: 1,
					resource: filterSampler,
				},
				{
					binding: 2,
					resource: ssaoUpscaleTexture.createView(),
				},
			],
		});

		this.globalUniformBindGroups.bloomDownsample = [];
		this.globalUniformBindGroups.bloomUpsample = [];
		for (let i = 0; i < BLOOM_SETTINGS.levels; i++) {
			const bloomDownsampleBindGroup = this.device.createBindGroup({
				layout: this.globalUniformBindGroupLayouts.bloomDownsample,
				entries: [
					{
						binding: 0,
						resource:
							i > 0
								? bloomTexture.createView({
										dimension: "2d",
										baseMipLevel: i,
										mipLevelCount: 1,
									})
								: sceneResolveView,
					},
					{
						binding: 1,
						resource: filterSampler,
					},
					{
						binding: 2,
						resource:
							i == BLOOM_SETTINGS.levels - 1
								? bloomOutTexture.createView({
										dimension: "2d",
										baseMipLevel: i + 1,
										mipLevelCount: 1,
									})
								: bloomTexture.createView({
										dimension: "2d",
										baseMipLevel: i + 1,
										mipLevelCount: 1,
									}),
					},
					{
						binding: 3,
						resource: {
							buffer:
								i === 0
									? this.uniformBuffers.bloomDownsample.prefilterEnabled
									: this.uniformBuffers.bloomDownsample.prefilterDisabled,
							offset: 0,
							size: 4,
						},
					},
				],
			});
			this.globalUniformBindGroups.bloomDownsample.push(bloomDownsampleBindGroup);

			const bloomUpsampleBindGroup = this.device.createBindGroup({
				layout: this.globalUniformBindGroupLayouts.bloomUpsample,
				entries: [
					{
						binding: 0,
						resource:
							i === 0
								? sceneResolveView
								: bloomTexture.createView({
										dimension: "2d",
										baseMipLevel: i,
										mipLevelCount: 1,
									}),
					},
					{
						binding: 1,
						resource: bloomOutTexture.createView({
							dimension: "2d",
							baseMipLevel: i + 1,
							mipLevelCount: 1,
						}),
					},
					{
						binding: 2,
						resource: filterSampler,
					},
					{
						binding: 3,
						resource: bloomOutTexture.createView({
							dimension: "2d",
							baseMipLevel: i,
							mipLevelCount: 1,
						}),
					},
					{
						binding: 4,
						resource: {
							buffer:
								i === 0
									? this.uniformBuffers.bloomDownsample.prefilterEnabled
									: this.uniformBuffers.bloomDownsample.prefilterDisabled,
							offset: 0,
							size: 4,
						},
					},
				],
			});
			this.globalUniformBindGroups.bloomUpsample.push(bloomUpsampleBindGroup);
		}

		// update render pass descriptor textures
		(this.renderPassDescriptors.depthPass as any).depthStencilAttachment = {
			view: depthTexture.createView({
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			}),
			depthClearValue: 1.0,
			depthLoadOp: "clear",
			depthStoreOp: "store",
		};
		(this.renderPassDescriptors.depthPass as any).colorAttachments = [
			{
				clearValue: [0.0, 0.0, 0.0, 1.0],
				loadOp: "clear",
				storeOp: "store",
				view: normalTexture.createView(),
			},
		];

		(this.renderPassDescriptors.sceneDraw as any).colorAttachments = [
			{
				clearValue: [0.0, 0.0, 0.0, 1.0],
				loadOp: "clear",
				storeOp: "store",
				view: sceneDrawView,
				resolveTarget: sceneResolveView,
			},
		];
		(this.renderPassDescriptors.sceneDraw as any).depthStencilAttachment = {
			view: depthTexture.createView({
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			}),
			depthReadOnly: true,
		};

		(this.renderPassDescriptors.postFX as any).colorAttachments = [
			{
				clearValue: [0.0, 0.0, 0.0, 1.0],
				loadOp: "clear",
				storeOp: "store",
				view: screenOutputView,
				resolveTarget: this.ctx.getCurrentTexture().createView(),
			},
		];

		this.updateRenderBundles();
	}

	/**
	 * Called upon initialization and update to shadow settings
	 */
	private buildShadowRenderDescriptor() {
		// shadow depth texture used while rendering
		const depthTexture = this.device.createTexture({
			label: "shadow depth texture",
			size: [SHADOW_SETTINGS.resolution, SHADOW_SETTINGS.resolution, SHADOW_SETTINGS.cascades.length],
			format: "depth32float",
			dimension: "2d",
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});
		this.shadowData.texture = depthTexture;

		for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
			(this.renderPassDescriptors.shadowPass[i] as any).depthStencilAttachment = {
				view: depthTexture.createView({
					baseArrayLayer: i,
					arrayLayerCount: 1,
					dimension: "2d",
				}),
				depthClearValue: 1.0,
				depthLoadOp: "clear",
				depthStoreOp: "store",
			};
		}
	}

	/**
	 * Updates the shadow cascade matrices and shadow data
	 */
	private updateShadows() {
		this.camera.updateShadows(this.canvas);

		// update shadow camera buffer
		const cascadeBufferSize = 256 / 4;
		for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
			this.uniformBufferData.shadows.set(this.camera.cascadeMatrices[i].view, i * cascadeBufferSize + 0);
			this.uniformBufferData.shadows.set(this.camera.cascadeMatrices[i].proj, i * cascadeBufferSize + 16);
			this.uniformBufferData.shadows[i * cascadeBufferSize + 32] = SHADOW_SETTINGS.cascades[i].radius;
			this.uniformBufferData.shadows[i * cascadeBufferSize + 33] = SHADOW_SETTINGS.cascades[i].bias;
			this.uniformBufferData.shadows[i * cascadeBufferSize + 34] = SHADOW_SETTINGS.cascades[i].normalBias;
			this.uniformBufferData.shadows[i * cascadeBufferSize + 35] = SHADOW_SETTINGS.cascades[i].samples;
			this.uniformBufferData.shadows[i * cascadeBufferSize + 36] = SHADOW_SETTINGS.cascades[i].blockerSamples;
			this.uniformBufferData.shadows[i * cascadeBufferSize + 37] = SHADOW_SETTINGS.cascades[i].near;
			this.uniformBufferData.shadows[i * cascadeBufferSize + 38] = SHADOW_SETTINGS.cascades[i].far;
		}
		this.device.queue.writeBuffer(
			this.uniformBuffers.shadows,
			0,
			this.uniformBufferData.shadows.buffer,
			this.uniformBufferData.shadows.byteOffset,
			this.uniformBufferData.shadows.byteLength,
		);
	}

	private onLightingLoad() {
		const skyData = this.sky!.sceneRenderData;
		if (!skyData) {
			return;
		}

		// ssao uniform buffer
		const ssaoUniformBuffer = this.device.createBuffer({
			label: "ssao uniform buffer",
			size: SSAO_SETTINGS.sampleCount * 4 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		const ssaoBufferData = new Float32Array(SSAO_SETTINGS.sampleCount * 4).fill(0);
		let i = 0;
		while (i < SSAO_SETTINGS.sampleCount) {
			const sample = vec3.fromValues(Math.random() * 2.0 - 1.0, Math.random() * 2.0 - 1.0, Math.random());
			vec3.normalize(sample, sample);
			let scale = i / SSAO_SETTINGS.sampleCount;
			vec3.scale(sample, scale, sample);
			ssaoBufferData.set(sample, i * 4);
			i++;
		}
		new Float32Array(ssaoUniformBuffer.getMappedRange()).set(ssaoBufferData);
		ssaoUniformBuffer.unmap();
		const ssaoNoiseTexture = this.device.createTexture({
			label: "ssao noise texture",
			size: [SSAO_SETTINGS.noiseTextureSize, SSAO_SETTINGS.noiseTextureSize],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
			sampleCount: 1,
			textureBindingViewDimension: "2d",
		});
		const ssaoNoiseData = new Uint8Array(4 * SSAO_SETTINGS.noiseTextureSize * SSAO_SETTINGS.noiseTextureSize);
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
			{ bytesPerRow: 4 * SSAO_SETTINGS.noiseTextureSize, rowsPerImage: SSAO_SETTINGS.noiseTextureSize },
			{ width: SSAO_SETTINGS.noiseTextureSize, height: SSAO_SETTINGS.noiseTextureSize },
		);

		// lighting uniform buffer
		const lightingUniformBuffer = this.device.createBuffer({
			label: "lighting uniform buffer",
			size: 2 * 4 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		const lightingBufferData = new Float32Array(2 * 4);
		lightingBufferData.set(SUN_SETTINGS.direction, 0);
		lightingBufferData.set(SUN_SETTINGS.color, 4);
		lightingBufferData[7] = SUN_SETTINGS.intensity;
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
			mipmapFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
			addressModeW: "clamp-to-edge",
		});

		const shadowmapComparisonSampler = this.device.createSampler({
			compare: "less",
		});

		const shadowmapSampler = this.device.createSampler({
			minFilter: "nearest",
			magFilter: "nearest",
		});

		const shadowKernel = new Float32Array([
			0.899991, 0.578509, 0.177038, 0.775628, 0.0375378, 0.0432752, 0.745567, 0.0315867, 0.523667, 0.437513,
			0.550523, 0.952696, 0.972564, 0.951964, 0.0355846, 0.42436, 0.473556, 0.146397, 0.976409, 0.250374,
			0.290323, 0.968688, 0.254341, 0.205237, 0.24897, 0.460097, 0.963775, 0.0310678, 0.0349742, 0.964934,
			0.585284, 0.66335, 0.767174, 0.843013, 0.756767, 0.313273, 0.392254, 0.76513, 0.0144047, 0.639027, 0.712607,
			0.527268, 0.903623, 0.415784, 0.283181, 0.615406, 0.272835, 0.0272835, 0.361736, 0.336894, 0.0772729,
			0.270272, 0.990753, 0.729698, 0.568255, 0.00128178, 0.00195318, 0.803125, 0.765069, 0.67748, 0.633686,
			0.182714, 0.42616, 0.916379, 0.184729, 0.333995, 0.398602, 0.510178, 0.85052, 0.957366, 0.814386, 0.16422,
			0.163976, 0.645375, 0.449324, 0.660024, 0.891812, 0.821253, 0.405499, 0.024781, 0.118961, 0.518601, 0.52736,
			0.821955, 0.647847, 0.783776, 0.162633, 0.927244, 0.592547, 0.544053, 0.537034, 0.268319, 0.698904,
			0.971587, 0.128025, 0.148228, 0.653371, 0.411298, 0.289926, 0.839778, 0.653279, 0.0365307, 0.97943, 0.34724,
			0.890347, 0.289193, 0.706168, 0.126133, 0.605884, 0.874905, 0.993469, 0.540391, 0.376415, 0.602649,
			0.0193182, 0.191534, 0.411389, 0.244362, 0.811884, 0.562639, 0.50856, 0.726646, 0.0868862, 0.714286,
			0.248299, 0.701346, 0.903012, 0.139409, 0.158177, 0.00915555, 0.892056, 0.724631, 0.00897244, 0.52916,
			0.273049, 0.371319, 0.810266, 0.391705, 0.0889004, 0.845668, 0.56328, 0.118748, 0.742607, 0.222633,
			0.630604, 0.314432, 0.225288, 0.112552, 0.348918, 0.146275, 0.98587, 0.847072, 0.847041, 0.0437941,
			0.144993, 0.425275, 0.169378, 0.239021, 0.493179, 0.548448, 0.667409, 0.624409, 0.440077, 0.403424, 0.97467,
			0.632618, 0.343791, 0.430372, 0.01236, 0.333232, 0.865078, 0.88461, 0.324656, 0.547624, 0.90643, 0.483779,
			0.828272, 0.700125, 0.0649434, 0.58446, 0.330332, 0.737602, 0.996979, 0.126743, 0.629231, 0.945524,
			0.518784, 0.613056, 0.210212, 0.853481, 0.325571, 0.229499, 0.0235603, 0.878597, 0.363262, 0.866176,
			0.772362, 0.946623, 0.813379, 0.782098, 0.716514, 0.762841, 0.489639, 0.042085, 0.470443, 0.978088,
			0.294595, 0.0950346, 0.974242, 0.445418, 0.515793, 0.202368, 0.682272, 0.269478, 0.00845363, 0.718528,
			0.783074, 0.103183, 0.581408, 0.360027, 0.207312, 0.515732, 0.280984, 0.291543, 0.599261, 0.473586, 0.68807,
			0.689291, 0.474136, 0.335734, 0.214454, 0.9794, 0.724174, 0.441786, 0.589892, 0.750542, 0.447737, 0.803339,
			0.879452, 0.215949, 0.829279, 0.474624, 0.244301, 0.911405, 0.370739, 0.669332, 0.0707724, 0.113102,
			0.107334, 0.995819, 0.204627, 0.582812, 0.704398, 0.898373, 0.69805, 0.348033, 0.499435, 0.89053, 0.10303,
			0.364818, 0.905454, 0.647633, 0.810175, 0.267281, 0.632008, 0.104648, 0.379894, 0.972625, 0.418439,
			0.0912809, 0.208991, 0.398877, 0.737632, 0.60564, 0.000854518, 0.10654, 0.419874, 0.702322, 0.856471,
			0.530931, 0.866848, 0.379315, 0.94586, 0.784722, 0.813623, 0.869747, 0.127384, 0.202948, 0.336161, 0.01236,
			0.157994, 0.289651, 0.997986, 0.184362, 0.0311594, 0.246895, 0.0678121, 0.524247, 0.464095, 0.223457,
			0.538163, 0.683309, 0.0872829, 0.0284433, 0.642628, 0.532334, 0.445357, 0.477126, 0.367016, 0.0777306,
			0.342296, 0.290323, 0.105686, 0.768639, 0.0890225, 0.910489, 0.0857265, 0.476241, 0.675832, 0.469771,
			0.951537, 0.0857265, 0.567095, 0.170629, 0.254799, 0.554491, 0.390301, 0.1901, 0.655538, 0.727866, 0.896664,
			0.0686361, 0.747093, 0.370067, 0.302591, 0.789788, 0.289682, 0.510788, 0.912046, 0.35258, 0.488021,
			0.281686, 0.207984, 0.166967, 0.850246, 0.097354, 0.912625, 0.00146489, 0.563097, 0.586657, 0.394269,
			0.381024, 0.599109, 0.256966, 0.760216, 0.789026, 0.14774, 0.565416, 0.170019, 0.711539, 0.748772, 0.999512,
			0.937162, 0.887387, 0.154363, 0.858028, 0.0568865, 0.789392, 0.321207, 0.921384, 0.423017, 0.301431,
			0.550707, 0.89227, 0.682211, 0.574877, 0.796655, 0.00253304, 0.938627, 0.17893, 0.935209, 0.688864,
			0.607562, 0.817591, 0.856563, 0.612751, 0.229987, 0.256294, 0.584582, 0.422987, 0.775384, 0.735282,
			0.661916, 0.84106, 0.941221, 0.997436, 0.397046, 0.448256, 0.231574, 0.77691, 0.167394, 0.0809046, 0.903409,
			0.925901, 0.080752, 0.634724, 0.357341, 0.811182, 0.69808, 0.18131, 0.799707, 0.627277, 0.302408, 0.17481,
			0.189123, 0.458815, 0.0776391, 0.171789, 0.956603, 0.300485, 0.709128, 0.815149, 0.0706503, 0.323374,
			0.63686, 0.671102, 0.432447, 0.592914, 0.335459, 0.999115, 0.0108646, 0.474075, 0.563128, 0.31254, 0.353526,
			0.480605, 0.532395, 0.37962, 0.212622, 0.054384, 0.941771, 0.523667, 0.543931, 0.510117, 0.839564, 0.309702,
			0.110599, 0.076632, 0.596759, 0.991607, 0.415693, 0.849391, 0.542283, 0.772637, 0.764519, 0.542161,
			0.594714, 0.0539567, 0.995239, 0.793146, 0.696188, 0.0089114, 0.762566, 0.173498, 0.803064, 0.21366,
			0.498611, 0.482833, 0.617115, 0.610736, 0.3043, 0.678182, 0.456404, 0.742637, 0.781274, 0.493698, 0.375042,
			0.919492, 0.240516, 0.641804, 0.324992, 0.379528, 0.853359, 0.427686, 0.213996, 0.00292978, 0.5356,
			0.0635701, 0.702902, 0.0746483, 0.0919523, 0.41731, 0.0524918, 0.376507, 0.332926, 0.629505, 0.00820948,
			0.587512, 0.457961, 0.00207526, 0.522202, 0.994934, 0.232643, 0.313364, 0.471328, 0.0957671, 0.85107,
			0.755943, 0.616901, 0.00903348, 0.276589, 0.412519,
		]);
		for (let i = 0; i < shadowKernel.length; i += 2) {
			shadowKernel[i] = shadowKernel[i] * 2.0 - 1.0;
			shadowKernel[i+1] = shadowKernel[i+1] * 2.0 - 1.0;
			const r = Math.sqrt(shadowKernel[i] * shadowKernel[i] + shadowKernel[i + 1] * shadowKernel[i + 1]);
			const theta = Math.atan2(shadowKernel[i + 1], shadowKernel[i]);
			shadowKernel[i] = r;
			shadowKernel[i + 1] = theta;
		}
		const shadowKernelBuffer = this.device.createBuffer({
			label: "shadow sample data buffer",
			size: shadowKernel.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(shadowKernelBuffer.getMappedRange()).set(shadowKernel);
		shadowKernelBuffer.unmap();

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
					resource: { buffer: ssaoUniformBuffer, offset: 0, size: SSAO_SETTINGS.sampleCount * 4 * 4 },
				},
				{
					binding: 7,
					resource: { buffer: lightingUniformBuffer, offset: 0, size: 2 * 4 * 4 },
				},
				{
					binding: 8,
					resource: shadowmapComparisonSampler,
				},
				{
					binding: 9,
					resource: shadowmapSampler,
				},
				{
					binding: 10,
					resource: { buffer: shadowKernelBuffer, offset: 0, size: shadowKernel.byteLength },
				},
				{
					binding: 11,
					resource: this.resources?.noise.createView(),
				},
				{
					binding: 12,
					resource: this.device.createSampler({
						minFilter: "linear",
						magFilter: "linear",
						mipmapFilter: "linear",
						addressModeU: "repeat",
						addressModeV: "repeat",
						addressModeW: "repeat",
					}),
				},
			],
		});
		this.globalUniformBindGroups.scene = sceneBindGroup;
	}

	private updateRenderBundles() {
		if (
			!this.globalUniformBindGroups.camera ||
			!this.globalUniformBindGroups.depth ||
			!this.globalUniformBindGroups.scene ||
			!this.globalUniformBindGroups.shadows
		) {
			return;
		}

		let encoder = this.device.createRenderBundleEncoder(this.renderBundleDescriptors.depth);
		encoder.setPipeline(this.pipelines.depth);
		encoder.setBindGroup(1, this.globalUniformBindGroups.camera);
		this.drawScene(encoder, 0);
		this.renderBundles.depth = encoder.finish();

		for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
			encoder = this.device.createRenderBundleEncoder(this.renderBundleDescriptors.shadows[i]);
			encoder.setPipeline(this.pipelines.shadows);
			encoder.setBindGroup(1, this.globalUniformBindGroups.shadows[i]);
			this.drawScene(encoder, i + 1);
			this.renderBundles.shadows[i] = encoder.finish();
		}

		encoder = this.device.createRenderBundleEncoder(this.renderBundleDescriptors.sceneDraw);
		encoder.setPipeline(this.pipelines.PBR);
		encoder.setBindGroup(1, this.globalUniformBindGroups.camera);
		encoder.setBindGroup(2, this.globalUniformBindGroups.depth);
		encoder.setBindGroup(3, this.globalUniformBindGroups.scene);
		this.drawScene(encoder, 0);
		if (this.sky && this.sky.skyboxRenderData) {
			encoder.setPipeline(this.sky.skyboxRenderData.pipeline);
			encoder.setBindGroup(0, this.sky.skyboxRenderData.cameraBindGroup);
			encoder.setBindGroup(1, this.sky.skyboxRenderData.textureBindGroup);
			encoder.setVertexBuffer(0, this.sky.skyboxRenderData.vertexBuffer);
			encoder.setIndexBuffer(this.sky.skyboxRenderData.indexBuffer, "uint16");
			encoder.drawIndexed(36);
		}
		this.renderBundles.sceneDraw = encoder.finish();
	}

	private drawScene(pass: GPURenderPassEncoder | GPURenderBundleEncoder, cullIndex: number) {
		for (const collection of Object.values(this.models.static)) {
			pass.setBindGroup(0, collection.instanceBindGroups[cullIndex]);
			pass.setVertexBuffer(0, collection.model.vertexBuffer);
			pass.setIndexBuffer(collection.model.indexBuffer, collection.model.indexFormat);
			pass.drawIndexedIndirect(collection.indirectBuffer, cullIndex * 20);
		}

		for (const collection of Object.values(this.models.dynamic)) {
			pass.setBindGroup(0, collection.instanceBindGroups[cullIndex]);
			pass.setVertexBuffer(0, collection.model.vertexBuffer);
			pass.setIndexBuffer(collection.model.indexBuffer, collection.model.indexFormat);
			pass.drawIndexedIndirect(collection.indirectBuffer, cullIndex * 20);
		}
	}

	private cullScene(encoder: GPUCommandEncoder) {
		// for (const collection of Object.values(this.models.static)) {
		// 	encoder.clearBuffer(collection.indirectBuffer, 4, 4); // clears instance count parameter
		// 	encoder.clearBuffer(collection.indirectShadowBuffer, 4, 4);
		// }
		for (const collection of Object.values(this.models.dynamic)) {
			for (let i = 0; i <= SHADOW_SETTINGS.cascades.length; i++) {
				encoder.clearBuffer(collection.indirectBuffer, 20 * i + 4, 4);
			}
		}

		const cullPass = encoder.beginComputePass(this.computePassDescriptors.culling);
		cullPass.setPipeline(this.pipelines.culling);
		// for (const collection of Object.values(this.models.static)) {
		// 	cullPass.setBindGroup(0, collection.cullingBindGroup);
		// 	cullPass.setBindGroup(1, this.globalUniformBindGroups.camera);
		// 	cullPass.dispatchWorkgroups(Math.ceil(collection.instanceCount / 64));
		// }
		for (const collection of Object.values(this.models.dynamic)) {
			cullPass.setBindGroup(0, collection.cullingBindGroup);
			cullPass.setBindGroup(1, this.globalUniformBindGroups.camera);
			cullPass.dispatchWorkgroups(Math.ceil(collection.instanceCount));
		}
		cullPass.end();
	}

	public draw(input: Input, deltaTime: number) {
		for (const obj of this.objects) {
			if (obj.usage !== "dynamic") {
				continue;
			}
			obj.model.roughness = 0.0;
			obj.model.transform.rotation[0] += deltaTime * 0.001 * (Math.sin(obj.instance) * 0.5 + 0.8);
			obj.model.transform.rotation[1] += deltaTime * 0.001 * (Math.sin(obj.instance) * 0.5 + 0.8);
			obj.model.transform.rotation[2] += deltaTime * 0.001 * (Math.sin(obj.instance) * 0.5 + 0.8);
			obj.model.update();
		}
		this.updateInstanceBufferData("dynamic");

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

		// update shadows
		if (!input.keyDown("c")) {
			this.updateShadows();
		}

		// if (input.keyPressed("v")) {
		// 	if (this.meshes.scene) {
		// 		this.addObject(this.meshes.scene, "static");
		// 	}
		// }
		// if (input.keyPressed("b")) {
		// 	this.removeObject(this.objects[Math.floor(Math.random() * this.objects.length)]);
		// }

		// update uniforms
		{
			// update camera buffer
			this.uniformBufferData.camera.set(this.camera.viewMatrix, 0);
			this.uniformBufferData.camera.set(this.camera.projMatrix, 16);
			this.uniformBufferData.camera.set(this.camera.position, 32);
			this.uniformBufferData.camera.set(this.camera.projMatrixInverse, 64);
			this.device.queue.writeBuffer(
				this.uniformBuffers.camera,
				0,
				this.uniformBufferData.camera.buffer,
				this.uniformBufferData.camera.byteOffset,
				this.uniformBufferData.camera.byteLength,
			);

			// rot proj matrix for the skybox
			if (this.sky && this.sky.skyboxRenderData) {
				this.device.queue.writeBuffer(
					this.sky.skyboxRenderData.cameraUniformBuffer,
					0,
					this.camera.rotProjMatrix.buffer,
					this.camera.rotProjMatrix.byteOffset,
					this.camera.rotProjMatrix.byteLength,
				);
			}
		}

		(this.renderPassDescriptors.postFX.colorAttachments as any)[0].resolveTarget = this.ctx
			.getCurrentTexture()
			.createView();
		const encoder = this.device.createCommandEncoder({ label: "render encoder" });

		if (!input.keyDown("h")) {
			this.cullScene(encoder);
		}

		{
			// shadow pass
			for (let i = 0; i < SHADOW_SETTINGS.cascades.length; i++) {
				const shadowPass = encoder.beginRenderPass(this.renderPassDescriptors.shadowPass![i]);
				if (this.renderBundles.shadows[i]) {
					shadowPass.executeBundles([this.renderBundles.shadows[i]!]);
				}
				shadowPass.end();
			}
		}

		{
			// depth prepass
			const depthPass = encoder.beginRenderPass(this.renderPassDescriptors.depthPass!);
			if (this.renderBundles.depth) {
				depthPass.executeBundles([this.renderBundles.depth]);
			}
			depthPass.end();
		}

		if (this.globalUniformBindGroups.ssao && this.globalUniformBindGroups.scene) {
			// ssao pass
			const ssaoPass = encoder.beginComputePass(this.computePassDescriptors.ssao);
			ssaoPass.setPipeline(this.pipelines.ssao);
			ssaoPass.setBindGroup(0, this.globalUniformBindGroups.ssao);
			ssaoPass.setBindGroup(1, this.globalUniformBindGroups.scene);
			ssaoPass.setBindGroup(2, this.globalUniformBindGroups.camera);
			ssaoPass.dispatchWorkgroups(Math.ceil(renderWidth / 16), Math.ceil(renderHeight / 16), 1);
			ssaoPass.end();

			// ssao blur horizontal pass
			let ssaoBlurPass = encoder.beginComputePass(this.computePassDescriptors.ssaoBlurX);
			ssaoBlurPass.setPipeline(this.pipelines.ssaoBlurX);
			ssaoBlurPass.setBindGroup(0, this.globalUniformBindGroups.ssaoBlurX);
			ssaoBlurPass.setBindGroup(1, this.globalUniformBindGroups.ssaoBlurKernelX);
			ssaoBlurPass.dispatchWorkgroups(Math.ceil(renderWidth / 16), Math.ceil(renderHeight / 16), 1);
			ssaoBlurPass.end();

			ssaoBlurPass = encoder.beginComputePass(this.computePassDescriptors.ssaoBlurY);
			ssaoBlurPass.setPipeline(this.pipelines.ssaoBlurY);
			ssaoBlurPass.setBindGroup(0, this.globalUniformBindGroups.ssaoBlurY);
			ssaoBlurPass.setBindGroup(1, this.globalUniformBindGroups.ssaoBlurKernelY);
			ssaoBlurPass.dispatchWorkgroups(Math.ceil(renderWidth / 16), Math.ceil(renderHeight / 16), 1);
			ssaoBlurPass.end();

			// ssao upscale pass
			const ssaoUpscalePass = encoder.beginComputePass(this.computePassDescriptors.ssaoUpscale);
			ssaoUpscalePass.setPipeline(this.pipelines.ssaoUpscale);
			ssaoUpscalePass.setBindGroup(0, this.globalUniformBindGroups.ssaoUpscale);
			ssaoUpscalePass.dispatchWorkgroups(Math.ceil(renderWidth / 8), Math.ceil(renderHeight / 8), 1);
			ssaoUpscalePass.end();
		}

		if (this.globalUniformBindGroups.scene) {
			const drawPass = encoder.beginRenderPass(this.renderPassDescriptors.sceneDraw!);
			if (this.renderBundles.sceneDraw) {
				drawPass.executeBundles([this.renderBundles.sceneDraw]);
			}
			drawPass.end();
		}

		if (this.globalUniformBindGroups.bloomDownsample && this.globalUniformBindGroups.bloomUpsample) {
			// bloom downsample pass
			for (let i = 0; i < BLOOM_SETTINGS.levels; i++) {
				const bloomPass = encoder.beginComputePass(this.computePassDescriptors.bloomDownsample[i]);
				bloomPass.setPipeline(this.pipelines.bloomDownsample);
				bloomPass.setBindGroup(0, this.globalUniformBindGroups.bloomDownsample[i]);
				bloomPass.dispatchWorkgroups(
					Math.ceil(this.bloomLevels[i + 1].width / 8),
					Math.ceil(this.bloomLevels[i + 1].height / 8),
					1,
				);
				bloomPass.end();
			}

			// bloom upsample pass

			for (let i = BLOOM_SETTINGS.levels - 1; i >= 0; i--) {
				const bloomPass = encoder.beginComputePass(this.computePassDescriptors.bloomUpsample[i]);
				bloomPass.setPipeline(this.pipelines.bloomUpsample);
				bloomPass.setBindGroup(0, this.globalUniformBindGroups.bloomUpsample[i]);
				bloomPass.dispatchWorkgroups(
					Math.ceil(this.bloomLevels[i].width / 8),
					Math.ceil(this.bloomLevels[i].height / 8),
					1,
				);
				bloomPass.end();
			}
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

		if (this.timestampData) {
			encoder.resolveQuerySet(
				this.timestampData.querySet,
				0,
				this.timestampData.querySet.count,
				this.timestampData.resolveBuffer,
				0,
			);
			if (this.timestampData.resultBuffer.mapState === "unmapped") {
				encoder.copyBufferToBuffer(
					this.timestampData.resolveBuffer,
					0,
					this.timestampData.resultBuffer,
					0,
					this.timestampData.resultBuffer.size,
				);
			}
		}

		this.device.queue.submit([encoder.finish()]);

		if (this.timestampData && this.timestampData.resultBuffer.mapState === "unmapped") {
			this.timestampData.resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
				const timestamps = new BigInt64Array(this.timestampData!.resultBuffer.getMappedRange());
				let bloomTime = 0;
				let hasBloom = false;
				let ssaoTime = 0;
				let hasSSAO = false;
				for (let i = 0; i < this.timestampData!.debugPasses.length; i++) {
					const pass = this.timestampData!.debugPasses[i].label || `Pass ${i}`;
					const time = Number(timestamps[i * 2 + 1] - timestamps[i * 2]) / 1000;
					if (pass.startsWith("Bloom")) {
						hasBloom = true;
						bloomTime += time;
					} else if (pass.startsWith("SSAO")) {
						hasSSAO = true;
						ssaoTime += time;
					} else {
						this.timestampData!.data[pass] = time;
					}
				}
				if (hasBloom) {
					this.timestampData!.data["Bloom Pass"] = bloomTime;
				}
				if (hasSSAO) {
					this.timestampData!.data["SSAO Pass"] = ssaoTime;
				}
				this.timestampData!.resultBuffer.unmap();
			});
		}
	}

	public onResize() {
		renderWidth = this.canvas.width + BLOOM_SETTINGS.padding * 2;
		renderHeight = this.canvas.height + BLOOM_SETTINGS.padding * 2;
		this.buildScreenRenderDescriptors();
	}
}
