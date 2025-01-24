import { default as diffuseVert } from "./shaders/diffuse.vs";
import { default as diffuseFrag } from "./shaders/diffuse.fs";
import { default as skyboxVert } from "./shaders/skybox.vs";
import { default as skyboxFrag } from "./shaders/skybox.fs";
import { default as cubemapGenVert } from "./shaders/cubemap_gen.vs";
import { default as cubemapGenFrag } from "./shaders/cubemap_gen.fs";
import { default as irradianceGenFrag } from "./shaders/irradiance_gen.fs";
import { default as prefilterGenFrag } from "./shaders/prefilter_gen.fs";
import { default as quadVert } from "./shaders/quad.vs";
import { default as quadFrag } from "./shaders/quad.fs";
import { default as brdfLUTGenFrag } from "./shaders/brdf_lut_gen.fs";
import { default as postFXFrag } from "./shaders/postfx.fs";
import { default as depthVert } from "./shaders/depth.vs";
import { default as depthFrag } from "./shaders/depth.fs";
import { default as ssaoFrag } from "./shaders/ssao.fs";
import { default as ssaoBlurFrag } from "./shaders/ssao_blur.fs";

type ShaderProgramSource = {
	vertex: string;
	fragment: string;
	attributes?: string[];
	uniforms?: string[];
};

export type Shaders = {
	diffuse: Shader;
	depth: Shader;
	skybox: Shader;
	cubemapGenerator: Shader;
	irradianceGenerator: Shader;
	prefilterGenerator: Shader;
	brdfLUTGenerator: Shader;
	quad: Shader;
	ssao: Shader;
	ssaoBlur: Shader;
	postFX: Shader;
};

export function loadShaders(gl: WebGL2RenderingContext): Shaders {
	const diffuse = new Shader(gl, {
		vertex: diffuseVert,
		fragment: diffuseFrag,
		attributes: ["vertex_xyzc", "vertex_normal", "vertex_uv"],
		uniforms: [
			"sky_irradiance",
			"sky_prefilter",
			"sky_brdf_lut",
			"albedo_map",
			"normal_map",
			"metallic_map",
			"roughness_map",
			"ao_map",
			"offset",
			"scale",
			"model_matrix",
			"normal_matrix",
			"texture_component_flags",
			"metallic",
			"roughness",
		],
	});
	gl.useProgram(diffuse.program);
	gl.uniform1i(diffuse.uniforms.sky_irradiance, 1);
	gl.uniform1i(diffuse.uniforms.sky_prefilter, 2);
	gl.uniform1i(diffuse.uniforms.sky_brdf_lut, 3);
	gl.uniform1i(diffuse.uniforms.albedo_map, 4);
	gl.uniform1i(diffuse.uniforms.normal_map, 5);
	gl.uniform1i(diffuse.uniforms.metallic_map, 6);
	gl.uniform1i(diffuse.uniforms.roughness_map, 7);
	gl.uniform1i(diffuse.uniforms.ao_map, 12);

	const depth = new Shader(gl, {
		vertex: depthVert,
		fragment: depthFrag,
		attributes: ["vertex_xyzc"],
		uniforms: [
			"model_matrix", "offset", "scale",
		],
	});

	const skybox = new Shader(gl, {
		vertex: skyboxVert,
		fragment: skyboxFrag,
		attributes: ["vertex_position"],
		uniforms: ["skybox", "rot_proj_matrix"],
	});
	gl.useProgram(skybox.program);
	gl.uniform1i(skybox.uniforms.skybox, 0);

	const cubemapGenerator = new Shader(gl, {
		vertex: cubemapGenVert,
		fragment: cubemapGenFrag,
		attributes: ["vertex_position"],
		uniforms: ["rect_texture", "proj_matrix", "view_matrix"],
	});
	const irradianceGenerator = new Shader(gl, {
		vertex: cubemapGenVert,
		fragment: irradianceGenFrag,
		attributes: ["vertex_position"],
		uniforms: ["skybox", "proj_matrix", "view_matrix"],
	});
	const prefilterGenerator = new Shader(gl, {
		vertex: cubemapGenVert,
		fragment: prefilterGenFrag,
		attributes: ["vertex_position"],
		uniforms: ["skybox", "proj_matrix", "view_matrix", "roughness"],
	});
	const brdfLUTGenerator = new Shader(gl, {
		vertex: quadVert,
		fragment: brdfLUTGenFrag,
		attributes: ["vertex_position", "tex_coords"],
	});
	const quad = new Shader(gl, {
		vertex: quadVert,
		fragment: quadFrag,
		attributes: ["vertex_position", "tex_coords"],
		uniforms: ["tex"],
	});

	const postFX = new Shader(gl, {
		vertex: quadVert,
		fragment: postFXFrag,
		attributes: ["vertex_position", "tex_coords"],
		uniforms: ["color_map"],
	});
	gl.useProgram(postFX.program);
	gl.uniform1i(postFX.uniforms.color_map, 8);

	const ssao = new Shader(gl, {
		vertex: quadVert,
		fragment: ssaoFrag,
		attributes: ["vertex_position", "tex_coords"],
		uniforms: ["depth_map", "noise_map", "proj_matrix", "proj_matrix_inverse", "kernel", "noise_scale"],
	});
	gl.useProgram(ssao.program);
	gl.uniform1i(ssao.uniforms.depth_map, 9);
	gl.uniform1i(ssao.uniforms.noise_map, 10);

	const ssaoBlur = new Shader(gl, {
		vertex: quadVert,
		fragment: ssaoBlurFrag,
		attributes: ["vertex_position", "tex_coords"],
		uniforms: ["ssao_map"],
	});
	gl.useProgram(ssaoBlur.program);
	gl.uniform1i(ssaoBlur.uniforms.ssao_map, 11);

	return {
		diffuse: diffuse,
		depth: depth,
		skybox: skybox,
		cubemapGenerator: cubemapGenerator,
		irradianceGenerator: irradianceGenerator,
		prefilterGenerator: prefilterGenerator,
		brdfLUTGenerator: brdfLUTGenerator,
		quad: quad,
		ssao: ssao,
		ssaoBlur: ssaoBlur,
		postFX: postFX,
	};
}

export default class Shader {
	public readonly program: WebGLProgram;
	public readonly attributes: { [key: string]: GLint } = {};
	public readonly uniforms: { [key: string]: WebGLUniformLocation } = {};

	constructor(gl: WebGL2RenderingContext, source: ShaderProgramSource) {
		const vertexShader = loadShader(gl, "vertex", source.vertex);
		const fragmentShader = loadShader(gl, "fragment", source.fragment);

		const program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`unable to initialize the shader program: ${gl.getProgramInfoLog(program)}`);
		}

		// bind the global ubo
		const uniformBlockIndex = gl.getUniformBlockIndex(program, "GlobalData");
		if (uniformBlockIndex !== gl.INVALID_INDEX) {
			gl.uniformBlockBinding(program, uniformBlockIndex, 0);
		}

		for (const attribute of source.attributes || []) {
			this.attributes[attribute] = gl.getAttribLocation(program, attribute);
		}
		for (const param of source.uniforms || []) {
			const uniform = gl.getUniformLocation(program, param);
			if (!uniform) {
				throw new Error(`invalid or missing uniform parameter for shader: ${param}`);
			}
			this.uniforms[param] = uniform;
		}

		this.program = program;
	}
}

function loadShader(gl: WebGL2RenderingContext, type: "vertex" | "fragment", source: string): WebGLShader {
	const shader = gl.createShader(type === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
	if (!shader) {
		throw new Error("shader couldn't be created");
	}
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		gl.deleteShader(shader);
		throw new Error(`error occurred compiling the shader ${source}: ${gl.getShaderInfoLog(shader)}`);
	}
	return shader;
}
