import { mat4, vec3 } from "wgpu-matrix";
import Camera from "./Camera";
import HDRjs from "./utils/hdr";
import loadHDR from "./utils/hdr";
import type { Shaders } from "./Shaders";

// export type PointLight = {
// 	position: vec3;
// 	color: vec3;
// 	intensity: number;
// };

const SKYBOX_RESOLUTION = 1024;
const IRRADIANCE_RESOLUTION = 64;
const PREFILTER_RESOLUTION = 256;
const PREFILTER_MIP_LEVELS = 5;
const BRDF_LUT_RESOLUTION = 512;

let a: any[] = [];

type SkyboxRenderData = {
	pipeline: GPURenderPipeline;
	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	cameraUniformBuffer: GPUBuffer;
	cameraBindGroup: GPUBindGroup;
	textureBindGroup: GPUBindGroup;
};

export default class Sky {
	public skyboxRenderData: SkyboxRenderData | null = null;

	private readonly camera: Camera;

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
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "none",
			},
			depthStencil: {
				depthWriteEnabled: false,
				depthCompare: "always",
				// depthCompare: "less-equal",
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

	constructor(device: GPUDevice, camera: Camera, shaders: Shaders) {
		this.camera = camera;

		// build the skybox vao
		// this.skyboxVAO = gl.createVertexArray();
		// gl.bindVertexArray(this.skyboxVAO);

		// const skyboxVertexBuffer = gl.createBuffer();
		// gl.bindBuffer(gl.ARRAY_BUFFER, skyboxVertexBuffer);
		// gl.bufferData(
		// 	gl.ARRAY_BUFFER,
		// 	new Float32Array([
		// 		-1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
		// 		1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
		// 	]),
		// 	gl.STATIC_DRAW,
		// );
		// gl.vertexAttribPointer(this.skyboxShader.attributes.vertex_position, 3, gl.FLOAT, false, 0, 0);
		// gl.enableVertexAttribArray(this.skyboxShader.attributes.vertex_position);

		// const skyboxIndexBuffer = gl.createBuffer();
		// gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexBuffer);
		// gl.bufferData(
		// 	gl.ELEMENT_ARRAY_BUFFER,
		// 	new Uint16Array([
		// 		0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 2, 7, 3, 2, 6, 7, 1, 6, 2, 1, 5, 6, 0, 3, 7, 0, 7,
		// 		4,
		// 	]),
		// 	gl.STATIC_DRAW,
		// );
		// gl.bindVertexArray(null);

		// load the skybox hdr texture
		loadHDR("/sky_indoor.hdr").then((hdr) => {
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
				addressModeU: "mirror-repeat",
				addressModeV: "mirror-repeat",
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
				size: [SKYBOX_RESOLUTION, SKYBOX_RESOLUTION, 6],
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
			a.push(skyboxCubemapTexture, skyboxRectangleTexture);
			{
				const commandEncoder = device.createCommandEncoder();
				const computePass = commandEncoder.beginComputePass();
				computePass.setPipeline(cubemapGeneratorPipeline);
				computePass.setBindGroup(0, cubemapGeneratorBindGroup);
				computePass.dispatchWorkgroups(Math.ceil(SKYBOX_RESOLUTION / 8), Math.ceil(SKYBOX_RESOLUTION / 8), 6);
				computePass.end();
				device.queue.submit([commandEncoder.finish()]);
			}

			// create the irradiance map
			const irradianceGeneratorPipeline = device.createComputePipeline({
				label: "irradiance map generator compute pipeline",
				layout: "auto",
				compute: {
					module: shaders.irradianceGenerator,
					entryPoint: "compute_irradiance",
				},
			});
			const irradianceTexture = device.createTexture({
				label: "irradiance texture",
				size: [IRRADIANCE_RESOLUTION, IRRADIANCE_RESOLUTION, 6],
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
			a.push(irradianceTexture);
			{
				const commandEncoder = device.createCommandEncoder();
				const computePass = commandEncoder.beginComputePass();
				computePass.setPipeline(irradianceGeneratorPipeline);
				computePass.setBindGroup(0, irradianceGeneratorBindGroup);
				computePass.dispatchWorkgroups(
					Math.ceil(IRRADIANCE_RESOLUTION / 4),
					Math.ceil(IRRADIANCE_RESOLUTION / 4),
					6,
				);
				computePass.end();
				device.queue.submit([commandEncoder.finish()]);
			}
			this.skyboxRenderData = this.createSkyboxRenderData(device, shaders, irradianceTexture);


			// generate the prefilter maps
			// const prefilterGeneratorPipeline = device.createComputePipeline({
			// 	label: "prefilter generator pipeline",
			// 	layout: "auto",
			// 	compute: {
			// 		module: shaders.prefilterGenerator,
			// 		entryPoint: "compute_prefilter",
			// 	},
			// });

			// const skyboxCubemapTexture = device.createTexture({
			// 	label: "skybox cubemap texture",
			// 	size: [SKYBOX_RESOLUTION, SKYBOX_RESOLUTION, 6],
			// 	dimension: "2d",
			// 	format: "rgba16float",
			// 	sampleCount: 1,
			// 	usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING,
			// });
			// const skyboxCubemapSampler = device.createSampler({
			// 	minFilter: "linear",
			// 	magFilter: "linear",
			// 	addressModeU: "clamp-to-edge",
			// 	addressModeV: "clamp-to-edge",
			// 	addressModeW: "clamp-to-edge",
			// });
			// const skyboxCubemapSampler = device.createSampler({
			// 	minFilter: "linear",
			// 	magFilter: "linear",
			// 	addressModeU: "clamp-to-edge",
			// 	addressModeV: "clamp-to-edge",
			// 	addressModeW: "clamp-to-edge",
			// });

			// create the framebuffer to draw the cubemap
			// const cubemapFBO = gl.createFramebuffer();
			// gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			// const cubemapRBO = gl.createRenderbuffer();
			// gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			// gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SKYBOX_RESOLUTION, SKYBOX_RESOLUTION);
			// gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, cubemapRBO);

			// // create the cubemap texture to generate
			// const skyboxTexture = gl.createTexture();
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);
			// for (let i = 0; i < 6; i++) {
			// 	gl.texImage2D(
			// 		gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
			// 		0,
			// 		gl.RGBA,
			// 		SKYBOX_RESOLUTION,
			// 		SKYBOX_RESOLUTION,
			// 		0,
			// 		gl.RGBA,
			// 		gl.UNSIGNED_BYTE,
			// 		null,
			// 	);
			// }
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

			// const cubemapProjection = mat4.perspective(mat4.create(), (90 * Math.PI) / 180, 1, 0.1, 10);
			// const cubemapViews = [
			// 	mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(1, 0, 0), vec3.fromValues(0, -1, 0)),
			// 	mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(-1, 0, 0), vec3.fromValues(0, -1, 0)),
			// 	mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, 1, 0), vec3.fromValues(0, 0, 1)),
			// 	mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, -1, 0), vec3.fromValues(0, 0, -1)),
			// 	mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, 0, 1), vec3.fromValues(0, -1, 0)),
			// 	mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, 0, -1), vec3.fromValues(0, -1, 0)),
			// ];
			// gl.useProgram(shaders.cubemapGenerator.program);
			// gl.uniformMatrix4fv(shaders.cubemapGenerator.uniforms.proj_matrix, false, cubemapProjection);
			// gl.uniform1i(shaders.cubemapGenerator.uniforms.rect_texture, 0);
			// gl.activeTexture(gl.TEXTURE0);
			// gl.bindTexture(gl.TEXTURE_2D, skyboxRectangleTexture);

			// gl.viewport(0, 0, SKYBOX_RESOLUTION, SKYBOX_RESOLUTION);
			// gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			// gl.bindVertexArray(cubemapGeneratorVAO);
			// gl.disable(gl.CULL_FACE);
			// for (let i = 0; i < 6; i++) {
			// 	gl.framebufferTexture2D(
			// 		gl.FRAMEBUFFER,
			// 		gl.COLOR_ATTACHMENT0,
			// 		gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
			// 		skyboxTexture,
			// 		0,
			// 	);
			// 	gl.uniformMatrix4fv(shaders.cubemapGenerator.uniforms.view_matrix, false, cubemapViews[i]);
			// 	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			// 	gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
			// }
			// gl.bindVertexArray(null);
			// gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			// gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

			// // create the irradiance map
			// const irradianceMap = gl.createTexture();
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, irradianceMap);
			// for (let i = 0; i < 6; i++) {
			// 	gl.texImage2D(
			// 		gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
			// 		0,
			// 		gl.RGBA16F,
			// 		IRRADIANCE_RESOLUTION,
			// 		IRRADIANCE_RESOLUTION,
			// 		0,
			// 		gl.RGBA,
			// 		gl.HALF_FLOAT,
			// 		null,
			// 	);
			// }
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

			// gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			// gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			// gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, IRRADIANCE_RESOLUTION, IRRADIANCE_RESOLUTION);

			// gl.useProgram(shaders.irradianceGenerator.program);
			// gl.uniform1i(shaders.irradianceGenerator.uniforms.skybox, 0);
			// gl.uniformMatrix4fv(shaders.irradianceGenerator.uniforms.proj_matrix, false, cubemapProjection);
			// gl.activeTexture(gl.TEXTURE0);
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);

			// gl.viewport(0, 0, IRRADIANCE_RESOLUTION, IRRADIANCE_RESOLUTION);
			// gl.bindVertexArray(cubemapGeneratorVAO);
			// gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			// for (let i = 0; i < 6; i++) {
			// 	gl.uniformMatrix4fv(shaders.irradianceGenerator.uniforms.view_matrix, false, cubemapViews[i]);
			// 	gl.framebufferTexture2D(
			// 		gl.FRAMEBUFFER,
			// 		gl.COLOR_ATTACHMENT0,
			// 		gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
			// 		irradianceMap,
			// 		0,
			// 	);
			// 	gl.uniformMatrix4fv(shaders.irradianceGenerator.uniforms.view_matrix, false, cubemapViews[i]);
			// 	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			// 	gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
			// }

			// // create the prefilter map
			// const prefilterMap = gl.createTexture();
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, prefilterMap);
			// for (let i = 0; i < 6; i++) {
			// 	gl.texImage2D(
			// 		gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
			// 		0,
			// 		gl.RGBA16F,
			// 		PREFILTER_RESOLUTION,
			// 		PREFILTER_RESOLUTION,
			// 		0,
			// 		gl.RGBA,
			// 		gl.HALF_FLOAT,
			// 		null,
			// 	);
			// }
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
			// gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

			// gl.useProgram(shaders.prefilterGenerator.program);
			// gl.uniform1i(shaders.prefilterGenerator.uniforms.skybox, 0);
			// gl.uniformMatrix4fv(shaders.prefilterGenerator.uniforms.proj_matrix, false, cubemapProjection);
			// gl.activeTexture(gl.TEXTURE0);
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);

			// gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			// let mipSize = PREFILTER_RESOLUTION;
			// for (let i = 0; i < PREFILTER_MIP_LEVELS; i++) {
			// 	gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			// 	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, mipSize, mipSize);
			// 	gl.viewport(0, 0, mipSize, mipSize);
			// 	const roughness = i / (PREFILTER_MIP_LEVELS - 1);
			// 	gl.uniform1f(shaders.prefilterGenerator.uniforms.roughness, roughness);
			// 	for (let j = 0; j < 6; j++) {
			// 		gl.framebufferTexture2D(
			// 			gl.FRAMEBUFFER,
			// 			gl.COLOR_ATTACHMENT0,
			// 			gl.TEXTURE_CUBE_MAP_POSITIVE_X + j,
			// 			prefilterMap,
			// 			i,
			// 		);
			// 		gl.uniformMatrix4fv(shaders.prefilterGenerator.uniforms.view_matrix, false, cubemapViews[j]);
			// 		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			// 		gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
			// 	}
			// 	mipSize /= 2;
			// }

			// // create a quad for generating the brdf LUT
			// const quadVertexBuffer = gl.createBuffer();
			// gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
			// gl.bufferData(
			// 	gl.ARRAY_BUFFER,
			// 	new Float32Array([-1.0, 1.0, 0.0, 1.0, -1.0, -1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 0.0]),
			// 	gl.STATIC_DRAW,
			// );
			// gl.vertexAttribPointer(shaders.brdfLUTGenerator.attributes.vertex_position, 2, gl.FLOAT, false, 16, 0);
			// gl.enableVertexAttribArray(shaders.brdfLUTGenerator.attributes.vertex_position);
			// gl.vertexAttribPointer(shaders.brdfLUTGenerator.attributes.tex_coords, 2, gl.FLOAT, false, 16, 8);
			// gl.enableVertexAttribArray(shaders.brdfLUTGenerator.attributes.tex_coords);

			// // create the brdf LUT
			// const brdfLUT = gl.createTexture();
			// gl.bindTexture(gl.TEXTURE_2D, brdfLUT);
			// gl.texImage2D(
			// 	gl.TEXTURE_2D,
			// 	0,
			// 	gl.RG16F,
			// 	BRDF_LUT_RESOLUTION,
			// 	BRDF_LUT_RESOLUTION,
			// 	0,
			// 	gl.RG,
			// 	gl.HALF_FLOAT,
			// 	null,
			// );
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			// gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			// gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brdfLUT, 0);
			// gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			// gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, BRDF_LUT_RESOLUTION, BRDF_LUT_RESOLUTION);
			// gl.viewport(0, 0, BRDF_LUT_RESOLUTION, BRDF_LUT_RESOLUTION);
			// gl.useProgram(shaders.brdfLUTGenerator.program);
			// gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			// gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			// // bind the textures to the correct slots
			// gl.activeTexture(gl.TEXTURE0);
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);
			// gl.activeTexture(gl.TEXTURE1);
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, irradianceMap);
			// gl.activeTexture(gl.TEXTURE2);
			// gl.bindTexture(gl.TEXTURE_CUBE_MAP, prefilterMap);
			// gl.activeTexture(gl.TEXTURE3);
			// gl.bindTexture(gl.TEXTURE_2D, brdfLUT);

			// // reset to the drawing state
			// gl.bindVertexArray(null);
			// gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			// gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
			// gl.enable(gl.CULL_FACE);
			// this.loaded = true;
		});
	}

	// public draw(gl: WebGL2RenderingContext) {
	// 	if (!this.skyboxVAO || !this.loaded) {
	// 		return;
	// 	}
	// 	// draw the skybox
	// 	gl.bindVertexArray(this.skyboxVAO);
	// 	gl.useProgram(this.skyboxShader.program);
	// 	gl.uniformMatrix4fv(this.skyboxShader.uniforms.rot_proj_matrix, false, this.camera.rotProjMatrix);

	// 	gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
	// 	gl.bindVertexArray(null);
	// }

	// public updateUBO(gl: WebGL2RenderingContext, ubo: WebGLBuffer) {
	// 	this.uboBuffer.set(this.sunDirection);
	// 	this.uboBuffer.set(this.sunColor, 4);
	// 	this.uboBuffer[7] = this.sunIntensity;
	// 	for (let i = 0; i < this.pointLights.length; i++) {
	// 		const light = this.pointLights[i];
	// 		this.uboBuffer.set(light.position, 8 + i * 4);
	// 		this.uboBuffer.set(light.color, 8 + (this.maxLights + i) * 4);
	// 		this.uboBuffer[11 + (this.maxLights + i) * 4] = light.intensity;
	// 	}
	// 	gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
	// 	gl.bufferSubData(gl.UNIFORM_BUFFER, 80, this.uboBuffer);
	// 	gl.bindBuffer(gl.UNIFORM_BUFFER, null);
	// }
}
