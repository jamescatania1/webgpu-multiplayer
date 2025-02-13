import { mat4, vec3 } from "wgpu-matrix";
import HDRjs from "./utils/hdr";
import loadHDR from "./utils/hdr";
import type { Shaders } from "./Shaders";
import Renderer, { POSTFX_SETTINGS, SKY_SETTINGS } from "./Renderer";

// export type PointLight = {
// 	position: vec3;
// 	color: vec3;
// 	intensity: number;
// };

type SkyboxRenderData = {
	pipeline: GPURenderPipeline;
	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	cameraUniformBuffer: GPUBuffer;
	cameraBindGroup: GPUBindGroup;
	textureBindGroup: GPUBindGroup;
};

type SceneData = {
	irradianceTexture: GPUTexture;
	prefilterTexture: GPUTexture;
	brdfTexture: GPUTexture;
};

export default class Sky {
	private readonly debug = true;

	public skyboxRenderData: SkyboxRenderData | null = null;
	public sceneRenderData: SceneData | null = null;

	constructor(renderer: Renderer, device: GPUDevice, shaders: Shaders) {
		let startTime: number;
		if (this.debug) {
			console.log("Loading skybox hdr...");
			startTime = performance.now();
		}

		// load the skybox hdr texture
		loadHDR(`/${SKY_SETTINGS.skyboxSource}.hdr`, 100.0).then((hdr) => {
			if (this.debug) {
				console.log(
					"Loaded hdr in ",
					(performance.now() - startTime).toFixed(2),
					"ms. Generating scene lighting maps...",
				);
				startTime = performance.now();
			}

			// generate the skybox cubemap from the equirrectangular hdr
			const cubemapGeneratorPipeline = device.createComputePipeline({
				label: "skybox cubemap generator compute pipeline",
				layout: "auto",
				compute: {
					module: shaders.cubemapGenerator,
					entryPoint: "compute_skybox",
				},
			});
			const skyboxRectangleTexture = device.createTexture({
				label: "skbox equirrectangular texture",
				size: [hdr.width, hdr.height],
				format: "rgba16float",
				sampleCount: 1,
				dimension: "2d",
				textureBindingViewDimension: "2d",
				usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
			});
			const skyboxRectangleSampler = device.createSampler({
				minFilter: "linear",
				magFilter: "linear",
				addressModeU: "clamp-to-edge",
				addressModeV: "clamp-to-edge",
				addressModeW: "clamp-to-edge",
			});
			device.queue.writeTexture(
				{
					texture: skyboxRectangleTexture,
					mipLevel: 0,
					origin: { x: 0, y: 0, z: 0 },
				},
				hdr.data,
				{ bytesPerRow: hdr.width * 8, rowsPerImage: hdr.height },
				{ width: hdr.width, height: hdr.height },
			);
			const skyboxCubemapTexture = device.createTexture({
				label: "skybox cubemap texture",
				size: [SKY_SETTINGS.skyboxResolution, SKY_SETTINGS.skyboxResolution, 6],
				format: "rgba16float",
				sampleCount: 1,
				dimension: "2d",
				usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
			});
			const cubemapGeneratorBindGroup = device.createBindGroup({
				label: "skybox cubemap generator bind group",
				layout: cubemapGeneratorPipeline.getBindGroupLayout(0),
				entries: [
					{
						binding: 0,
						resource: skyboxRectangleTexture.createView(),
					},
					{
						binding: 1,
						resource: skyboxRectangleSampler,
					},
					{
						binding: 2,
						resource: skyboxCubemapTexture.createView(),
					},
				],
			});
			{
				const encoder = device.createCommandEncoder();
				const computePass = encoder.beginComputePass();
				computePass.setPipeline(cubemapGeneratorPipeline);
				computePass.setBindGroup(0, cubemapGeneratorBindGroup);
				computePass.dispatchWorkgroups(
					Math.ceil(SKY_SETTINGS.skyboxResolution / 8),
					Math.ceil(SKY_SETTINGS.skyboxResolution / 8),
					6,
				);
				computePass.end();
				device.queue.submit([encoder.finish()]);
				this.skyboxRenderData = this.createSkyboxRenderData(device, shaders, skyboxCubemapTexture);
			}

			// create the irradiance map
			const irradianceGeneratorPipeline = device.createComputePipeline({
				label: "irradiance map generator compute pipeline",
				layout: "auto",
				compute: {
					module: shaders.irradianceGenerator,
					entryPoint: "compute_irradiance",
					constants: {
						delta: SKY_SETTINGS.irradianceSampleDelta,
					},
				},
			});
			const irradianceTexture = device.createTexture({
				label: "irradiance texture",
				size: [SKY_SETTINGS.irradianceResolution, SKY_SETTINGS.irradianceResolution, 6],
				format: "rgba16float",
				sampleCount: 1,
				dimension: "2d",
				usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
			});
			const irradianceGeneratorBindGroup = device.createBindGroup({
				label: "irradiance generator bind group",
				layout: irradianceGeneratorPipeline.getBindGroupLayout(0),
				entries: [
					{
						binding: 0,
						resource: skyboxCubemapTexture.createView({
							dimension: "2d-array",
						}),
					},
					{
						binding: 1,
						resource: irradianceTexture.createView(),
					},
				],
			});
			{
				const commandEncoder = device.createCommandEncoder();
				const computePass = commandEncoder.beginComputePass();
				computePass.setPipeline(irradianceGeneratorPipeline);
				computePass.setBindGroup(0, irradianceGeneratorBindGroup);
				computePass.dispatchWorkgroups(
					Math.ceil(SKY_SETTINGS.irradianceResolution / 4),
					Math.ceil(SKY_SETTINGS.irradianceResolution / 4),
					6,
				);
				computePass.end();
				device.queue.submit([commandEncoder.finish()]);
			}

			// generate the prefilter maps
			const prefilterGeneratorPipeline = device.createComputePipeline({
				label: "prefilter generator pipeline",
				layout: "auto",
				compute: {
					module: shaders.prefilterGenerator,
					entryPoint: "compute_prefilter",
					constants: {
						sample_count: SKY_SETTINGS.prefilterSamples,
					},
				},
			});
			const prefilterCubemapSampler = device.createSampler({
				label: "sky cubemap filter for prefilter generator",
				minFilter: "linear",
				magFilter: "linear",
				addressModeU: "clamp-to-edge",
				addressModeV: "clamp-to-edge",
				addressModeW: "clamp-to-edge",
			});
			const prefilterTexture = device.createTexture({
				label: "prefilter texture",
				size: [SKY_SETTINGS.prefilterResolution, SKY_SETTINGS.prefilterResolution, 6],
				format: "rgba16float",
				sampleCount: 1,
				dimension: "2d",
				usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
				mipLevelCount: SKY_SETTINGS.prefilterMipLevels,
			});
			const prefilterGeneratorUniformBuffer = device.createBuffer({
				label: "prefilter uniform buffer",
				size: 4,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});
			for (let i = 0; i < SKY_SETTINGS.prefilterMipLevels; i++) {
				const roughness = i / (SKY_SETTINGS.prefilterMipLevels - 1);
				const prefilterGeneratorBindGroup = device.createBindGroup({
					label: "prefilter generator bind group",
					layout: prefilterGeneratorPipeline.getBindGroupLayout(0),
					entries: [
						{
							binding: 0,
							resource: skyboxCubemapTexture.createView({
								dimension: "cube",
							}),
						},
						{
							binding: 1,
							resource: prefilterCubemapSampler,
						},
						{
							binding: 2,
							resource: prefilterTexture.createView({
								baseMipLevel: i,
								mipLevelCount: 1,
							}),
						},
						{
							binding: 3,
							resource: {
								buffer: prefilterGeneratorUniformBuffer,
								offset: 0,
								size: 4,
							},
						},
					],
				});
				device.queue.writeBuffer(prefilterGeneratorUniformBuffer, 0, new Float32Array([roughness]).buffer);

				const encoder = device.createCommandEncoder();
				const pass = encoder.beginComputePass();
				pass.setPipeline(prefilterGeneratorPipeline);
				pass.setBindGroup(0, prefilterGeneratorBindGroup);
				const mipResolution = SKY_SETTINGS.prefilterResolution / 2 ** i;
				pass.dispatchWorkgroups(Math.ceil(mipResolution / 4), Math.ceil(mipResolution / 4), 6);
				pass.end();
				device.queue.submit([encoder.finish()]);
			}

			// create the BRDF lut
			const brdfGeneratorPipeline = device.createComputePipeline({
				label: "BRDF LUT generator pipeline",
				layout: "auto",
				compute: {
					module: shaders.brdfGenerator,
					entryPoint: "compute_brdf",
					constants: {
						sample_count: SKY_SETTINGS.brdfSamples,
						lut_size: SKY_SETTINGS.brdfResolution,
					},
				},
			});
			const brdfLUT = device.createTexture({
				label: "BRDF LUT",
				size: [SKY_SETTINGS.brdfResolution, SKY_SETTINGS.brdfResolution],
				format: "rgba16float",
				sampleCount: 1,
				dimension: "2d",
				usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
			});
			const brdfGeneratorBindGroup = device.createBindGroup({
				label: "BRDF generator bind group",
				layout: brdfGeneratorPipeline.getBindGroupLayout(0),
				entries: [
					{
						binding: 0,
						resource: brdfLUT.createView(),
					},
				],
			});
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			pass.setPipeline(brdfGeneratorPipeline);
			pass.setBindGroup(0, brdfGeneratorBindGroup);
			pass.dispatchWorkgroups(
				Math.ceil(SKY_SETTINGS.brdfResolution / 8),
				Math.ceil(SKY_SETTINGS.brdfResolution / 8),
				1,
			);
			pass.end();
			device.queue.submit([encoder.finish()]);

			this.sceneRenderData = {
				irradianceTexture: irradianceTexture,
				prefilterTexture: prefilterTexture,
				brdfTexture: brdfLUT,
			};

			if (this.debug) {
				console.log("Generated scene lighting maps in ", (performance.now() - startTime).toFixed(2), "ms.");
			}

			renderer.onLightingLoad();
		});
	}

	private createSkyboxRenderData(device: GPUDevice, shaders: Shaders, skybox: GPUTexture): SkyboxRenderData {
		const pipeline = device.createRenderPipeline({
			label: "skybox scene view render pipeline",
			layout: "auto",
			vertex: {
				module: shaders.skybox,
				entryPoint: "vs",
				buffers: [
					{
						arrayStride: 3 * 4,
						attributes: [
							{
								shaderLocation: 0,
								offset: 0,
								format: "float32x3",
							},
						],
					},
				],
			},
			fragment: {
				module: shaders.skybox,
				entryPoint: "fs",
				targets: [{ format: "rgba16float" }, { format: "r16float" }],
				constants: {
					gamma: POSTFX_SETTINGS.gamma,
					gamma_offset: SKY_SETTINGS.gammaOffset,
				}
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "none",
			},
			depthStencil: {
				depthWriteEnabled: false,
				depthCompare: "less-equal",
				format: "depth32float",
			},
			multisample: {
				count: 4,
			},
		});

		const cameraUniformBuffer = device.createBuffer({
			size: 16 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const cameraBindGroup = device.createBindGroup({
			label: "skybox camera uniform bind group",
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: cameraUniformBuffer,
						size: 16 * 4,
						offset: 0,
					},
				},
			],
		});

		const skyboxSampler = device.createSampler({
			minFilter: "linear",
			magFilter: "linear",
		});
		const textureBindGroup = device.createBindGroup({
			label: "skybox texture bind group",
			layout: pipeline.getBindGroupLayout(1),
			entries: [
				{
					binding: 0,
					resource: skybox.createView({
						dimension: "cube",
					}),
				},
				{
					binding: 1,
					resource: skyboxSampler,
				},
			],
		});

		// prettier-ignore
		const cubeVertexData = new Float32Array([
			-1.0, -1.0, -1.0,   1.0, -1.0, -1.0, 
			1.0, 1.0, -1.0,     -1.0, 1.0, -1.0, 
			-1.0, -1.0, 1.0,    1.0, -1.0, 1.0,
			1.0, 1.0, 1.0,      -1.0, 1.0, 1.0
		]);
		const cubeVertexBuffer = device.createBuffer({
			label: "skybox cube vertex buffer",
			size: cubeVertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(cubeVertexBuffer.getMappedRange()).set(cubeVertexData);
		cubeVertexBuffer.unmap();

		// prettier-ignore
		const cubeIndexData = new Uint16Array([
			0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 
			0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 
			1, 2, 6, 1, 6, 5, 0, 7, 3, 0, 4, 7,
		]);
		const cubeIndexBuffer = device.createBuffer({
			label: "skybox cube index buffer",
			size: cubeIndexData.byteLength,
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
		});
		new Uint16Array(cubeIndexBuffer.getMappedRange()).set(cubeIndexData);
		cubeIndexBuffer.unmap();

		return {
			pipeline: pipeline,
			vertexBuffer: cubeVertexBuffer,
			indexBuffer: cubeIndexBuffer,
			cameraUniformBuffer: cameraUniformBuffer,
			cameraBindGroup: cameraBindGroup,
			textureBindGroup: textureBindGroup,
		};
	}
}
