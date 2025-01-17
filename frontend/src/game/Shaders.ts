import {default as diffuseVert} from "./shaders/diffuse.vs";
import {default as diffuseFrag} from "./shaders/diffuse.fs";
import {default as skyboxVert} from "./shaders/skybox.vs";
import {default as skyboxFrag} from "./shaders/skybox.fs";

type ShaderProgramSource = {
	vertex: string;
	fragment: string;
	attributes?: string[];
	uniforms?: string[];
};

export type Shaders = {
	diffuse: Shader;
	skybox: Shader;
}

export function loadShaders(gl: WebGL2RenderingContext): Shaders {
	const diffuse = new Shader(gl, {
		vertex: diffuseVert,
		fragment: diffuseFrag,
		attributes: ["vertex_data"],
		uniforms: ["model_matrix", "normal_matrix"],
	});
	const skybox = new Shader(gl, {
		vertex: skyboxVert,
		fragment: skyboxFrag,
		attributes: ["vertex_position"],
		uniforms: ["skybox", "rot_proj_matrix"],
	});

	return {
		diffuse: diffuse,
		skybox: skybox,
	}
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