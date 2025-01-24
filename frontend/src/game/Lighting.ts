import { mat4, vec3 } from "gl-matrix";
import type Shader from "./Shaders";
import Camera from "./Camera";
import HDRjs from "./utils/hdr";
import loadHDR from "./utils/hdr";
import type { Shaders } from "./Shaders";

export type PointLight = {
	position: vec3;
	color: vec3;
	intensity: number;
};

const SKYBOX_RESOLUTION = 1024;
const IRRADIANCE_RESOLUTION = 64;
const PREFILTER_RESOLUTION = 256;
const PREFILTER_MIP_LEVELS = 5;
const BRDF_LUT_RESOLUTION = 512;

export default class Lighting {
	public readonly sunColor = vec3.fromValues(1, 240.0 / 255.0, 214.0 / 255.0);
	public readonly sunDirection = vec3.create();
	public readonly pointLights: PointLight[];
	public loaded = false;

	private readonly maxLights = 4;
	private readonly uboBuffer = new Float32Array(40);
	private readonly sunPosition = vec3.fromValues(20, 50, 17);
	public readonly sunIntensity = 0.8;

	private readonly skyboxShader: Shader;
	private readonly skyboxVAO: WebGLVertexArrayObject;
	private readonly camera: Camera;

	constructor(gl: WebGL2RenderingContext, camera: Camera, shaders: Shaders) {
		this.camera = camera;
		this.skyboxShader = shaders.skybox;

		vec3.normalize(this.sunDirection, this.sunPosition);
		this.pointLights = [
			// {
			// 	position: vec3.fromValues(1, 6, 3),
			// 	color: vec3.fromValues(1, 0, 1),
			// 	intensity: 3.0,
			// },
			// {
			// 	position: vec3.fromValues(-1, 2, -2),
			// 	color: vec3.fromValues(0, 1, 1),
			// 	intensity: 1.0,
			// },
		];

		// build the skybox vao
		this.skyboxVAO = gl.createVertexArray();
		gl.bindVertexArray(this.skyboxVAO);

		const skyboxVertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, skyboxVertexBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				-1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
				1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
			]),
			gl.STATIC_DRAW,
		);
		gl.vertexAttribPointer(this.skyboxShader.attributes.vertex_position, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.skyboxShader.attributes.vertex_position);

		const skyboxIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexBuffer);
		gl.bufferData(
			gl.ELEMENT_ARRAY_BUFFER,
			new Uint16Array([
				0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 5, 1, 0, 4, 5, 2, 7, 3, 2, 6, 7, 1, 6, 2, 1, 5, 6, 0, 3, 7, 0, 7,
				4,
			]),
			gl.STATIC_DRAW,
		);
		gl.bindVertexArray(null);

		// load the skybox hdr texture
		loadHDR("/sky.hdr").then((hdr) => {
			const rectSkyboxTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, rectSkyboxTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, hdr.width, hdr.height, 0, gl.RGB, gl.HALF_FLOAT, hdr.data);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindTexture(gl.TEXTURE_2D, null);

			// create the skybox vao for making the cubemap
			const cubemapGeneratorVAO = gl.createVertexArray();
			gl.bindVertexArray(cubemapGeneratorVAO);

			const cubemapVertexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, cubemapVertexBuffer);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Float32Array([
					-1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0,
					1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
				]),
				gl.STATIC_DRAW,
			);
			gl.vertexAttribPointer(shaders.cubemapGenerator.attributes.vertex_position, 3, gl.FLOAT, false, 0, 0);
			gl.enableVertexAttribArray(shaders.cubemapGenerator.attributes.vertex_position);

			const cubemapIndexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubemapIndexBuffer);
			gl.bufferData(
				gl.ELEMENT_ARRAY_BUFFER,
				new Uint16Array([
					0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 7, 3,
					0, 4, 7,
				]),
				gl.STATIC_DRAW,
			);
			gl.bindVertexArray(null);

			// create the framebuffer to draw the cubemap
			const cubemapFBO = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			const cubemapRBO = gl.createRenderbuffer();
			gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SKYBOX_RESOLUTION, SKYBOX_RESOLUTION);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, cubemapRBO);

			// create the cubemap texture to generate
			const skyboxTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);
			for (let i = 0; i < 6; i++) {
				gl.texImage2D(
					gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
					0,
					gl.RGBA,
					SKYBOX_RESOLUTION,
					SKYBOX_RESOLUTION,
					0,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					null,
				);
			}
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

			const cubemapProjection = mat4.perspective(mat4.create(), (90 * Math.PI) / 180, 1, 0.1, 10);
			const cubemapViews = [
				mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(1, 0, 0), vec3.fromValues(0, -1, 0)),
				mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(-1, 0, 0), vec3.fromValues(0, -1, 0)),
				mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, 1, 0), vec3.fromValues(0, 0, 1)),
				mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, -1, 0), vec3.fromValues(0, 0, -1)),
				mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, 0, 1), vec3.fromValues(0, -1, 0)),
				mat4.lookAt(mat4.create(), vec3.create(), vec3.fromValues(0, 0, -1), vec3.fromValues(0, -1, 0)),
			];
			gl.useProgram(shaders.cubemapGenerator.program);
			gl.uniformMatrix4fv(shaders.cubemapGenerator.uniforms.proj_matrix, false, cubemapProjection);
			gl.uniform1i(shaders.cubemapGenerator.uniforms.rect_texture, 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, rectSkyboxTexture);

			gl.viewport(0, 0, SKYBOX_RESOLUTION, SKYBOX_RESOLUTION);
			gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			gl.bindVertexArray(cubemapGeneratorVAO);
			gl.disable(gl.CULL_FACE);
			for (let i = 0; i < 6; i++) {
				gl.framebufferTexture2D(
					gl.FRAMEBUFFER,
					gl.COLOR_ATTACHMENT0,
					gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
					skyboxTexture,
					0,
				);
				gl.uniformMatrix4fv(shaders.cubemapGenerator.uniforms.view_matrix, false, cubemapViews[i]);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
			}
			gl.bindVertexArray(null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

			// create the irradiance map
			const irradianceMap = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, irradianceMap);
			for (let i = 0; i < 6; i++) {
				gl.texImage2D(
					gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
					0,
					gl.RGBA16F,
					IRRADIANCE_RESOLUTION,
					IRRADIANCE_RESOLUTION,
					0,
					gl.RGBA,
					gl.HALF_FLOAT,
					null,
				);
			}
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

			gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, IRRADIANCE_RESOLUTION, IRRADIANCE_RESOLUTION);

			gl.useProgram(shaders.irradianceGenerator.program);
			gl.uniform1i(shaders.irradianceGenerator.uniforms.skybox, 0);
			gl.uniformMatrix4fv(shaders.irradianceGenerator.uniforms.proj_matrix, false, cubemapProjection);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);

			gl.viewport(0, 0, IRRADIANCE_RESOLUTION, IRRADIANCE_RESOLUTION);
			gl.bindVertexArray(cubemapGeneratorVAO);
			gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			for (let i = 0; i < 6; i++) {
				gl.uniformMatrix4fv(shaders.irradianceGenerator.uniforms.view_matrix, false, cubemapViews[i]);
				gl.framebufferTexture2D(
					gl.FRAMEBUFFER,
					gl.COLOR_ATTACHMENT0,
					gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
					irradianceMap,
					0,
				);
				gl.uniformMatrix4fv(shaders.irradianceGenerator.uniforms.view_matrix, false, cubemapViews[i]);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
			}

			// create the prefilter map
			const prefilterMap = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, prefilterMap);
			for (let i = 0; i < 6; i++) {
				gl.texImage2D(
					gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
					0,
					gl.RGBA16F,
					PREFILTER_RESOLUTION,
					PREFILTER_RESOLUTION,
					0,
					gl.RGBA,
					gl.HALF_FLOAT,
					null,
				);
			}
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
			gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

			gl.useProgram(shaders.prefilterGenerator.program);
			gl.uniform1i(shaders.prefilterGenerator.uniforms.skybox, 0);
			gl.uniformMatrix4fv(shaders.prefilterGenerator.uniforms.proj_matrix, false, cubemapProjection);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);

			gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			let mipSize = PREFILTER_RESOLUTION;
			for (let i = 0; i < PREFILTER_MIP_LEVELS; i++) {
				gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
				gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, mipSize, mipSize);
				gl.viewport(0, 0, mipSize, mipSize);
				const roughness = i / (PREFILTER_MIP_LEVELS - 1);
				gl.uniform1f(shaders.prefilterGenerator.uniforms.roughness, roughness);
				for (let j = 0; j < 6; j++) {
					gl.framebufferTexture2D(
						gl.FRAMEBUFFER,
						gl.COLOR_ATTACHMENT0,
						gl.TEXTURE_CUBE_MAP_POSITIVE_X + j,
						prefilterMap,
						i,
					);
					gl.uniformMatrix4fv(shaders.prefilterGenerator.uniforms.view_matrix, false, cubemapViews[j]);
					gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
					gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
				}
				mipSize /= 2;
			}

			// create a quad for generating the brdf LUT
			const quadVertexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				new Float32Array([-1.0, 1.0, 0.0, 1.0, -1.0, -1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 0.0]),
				gl.STATIC_DRAW,
			);
			gl.vertexAttribPointer(shaders.brdfLUTGenerator.attributes.vertex_position, 2, gl.FLOAT, false, 16, 0);
			gl.enableVertexAttribArray(shaders.brdfLUTGenerator.attributes.vertex_position);
			gl.vertexAttribPointer(shaders.brdfLUTGenerator.attributes.tex_coords, 2, gl.FLOAT, false, 16, 8);
			gl.enableVertexAttribArray(shaders.brdfLUTGenerator.attributes.tex_coords);
			
			// create the brdf LUT
			const brdfLUT = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, brdfLUT);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, BRDF_LUT_RESOLUTION, BRDF_LUT_RESOLUTION, 0, gl.RG, gl.HALF_FLOAT, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.bindFramebuffer(gl.FRAMEBUFFER, cubemapFBO);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brdfLUT, 0);
			gl.bindRenderbuffer(gl.RENDERBUFFER, cubemapRBO);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, BRDF_LUT_RESOLUTION, BRDF_LUT_RESOLUTION);
			gl.viewport(0, 0, BRDF_LUT_RESOLUTION, BRDF_LUT_RESOLUTION);
			gl.useProgram(shaders.brdfLUTGenerator.program);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


			// bind the textures to the correct slots
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, irradianceMap);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_CUBE_MAP, prefilterMap);
			gl.activeTexture(gl.TEXTURE3);
			gl.bindTexture(gl.TEXTURE_2D, brdfLUT);

			// reset to the drawing state
			gl.bindVertexArray(null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
			gl.enable(gl.CULL_FACE);
			this.loaded = true;
		});
	}

	public draw(gl: WebGL2RenderingContext) {
		if (!this.skyboxVAO || !this.loaded) {
			return;
		}
		// draw the skybox
		gl.bindVertexArray(this.skyboxVAO);
		gl.useProgram(this.skyboxShader.program);
		gl.uniformMatrix4fv(this.skyboxShader.uniforms.rot_proj_matrix, false, this.camera.rotProjMatrix);

		gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}

	public updateUBO(gl: WebGL2RenderingContext, ubo: WebGLBuffer) {
		this.uboBuffer.set(this.sunDirection);
		this.uboBuffer.set(this.sunColor, 4);
		this.uboBuffer[7] = this.sunIntensity;
		for (let i = 0; i < this.pointLights.length; i++) {
			const light = this.pointLights[i];
			this.uboBuffer.set(light.position, 8 + i * 4);
			this.uboBuffer.set(light.color, 8 + (this.maxLights + i) * 4);
			this.uboBuffer[11 + (this.maxLights + i) * 4] = light.intensity;
		}
		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 80, this.uboBuffer);
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);
	}
}
