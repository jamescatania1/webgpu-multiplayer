type ShaderProgramSource = {
	vertex: string;
	fragment: string;
	attributes?: string[];
	uniforms?: string[];
};

export type Shaders = {
	diffuse: Shader;
}

export function loadShaders(gl: WebGL2RenderingContext): Shaders {
	const diffuseVertex = `#version 300 es
		in uvec3 vertex_data;

		uniform mat4 view_proj_matrix;
		uniform mat4 model_matrix;
		uniform mat3 normal_matrix;

		out vec3 normal;
		out vec3 position;
		out lowp vec3 color;
		
		void main() {
			float x = float(vertex_data.x >> 16u) / 65535.0 - 0.5;
			float y = float(vertex_data.x & 0xFFFFu) / 65535.0 - 0.5;
			float z = float(vertex_data.y >> 16u) / 65535.0 - 0.5;
			position = (model_matrix * vec4(x, y, z, 1.0)).xyz;
			gl_Position = view_proj_matrix * model_matrix * vec4(x, y, z, 1.0);

			float r = float((vertex_data.y >> 11u) & 0x1Fu) / 31.0;
			float g = float((vertex_data.y >> 5u) & 0x3Fu) / 63.0;
			float b = float(vertex_data.y & 0x1Fu) / 31.0;
			color = vec3(r, g, b);

			float nx = float(vertex_data.z >> 22u) / 511.5 - 1.0;
			float ny = float((vertex_data.z >> 12u) & 0x3FFu) / 511.5 - 1.0;
			float nz = float((vertex_data.z >> 2u) & 0x3FFu) / 511.5 - 1.0;
			normal = normal_matrix * vec3(nx, ny, nz);
		}
	`;
	const diffuseFrag = `#version 300 es
		precision highp float;

		in vec3 normal;
		in vec3 position;
		in lowp vec3 color;
		
		out vec4 outColor;
		
		void main() {
			vec3 lightPos = vec3(-5.0, 50.0, 10.0);
			vec3 lightDir = normalize(lightPos - position);
			float diff = max(dot(normal, lightDir), 0.0);
			vec3 diffuse = diff * vec3(1.0, 1.0, 1.0);

			outColor = vec4((diffuse * 0.5 + 0.5) * color, 1.0);
		}
	`;
	const diffuse = new Shader(gl, {
		vertex: diffuseVertex,
		fragment: diffuseFrag,
		attributes: ["vertex_data"],
		uniforms: ["view_proj_matrix", "model_matrix", "normal_matrix"],
	});

	return {
		diffuse: diffuse,
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

function loadShader(gl: WebGL2RenderingContext, type: "vertex" | "fragment", source: string) {
	const shader = gl.createShader(type === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
	if (!shader) {
		throw new Error("shader couldn't be created");
	}
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		gl.deleteShader(shader);
		throw new Error(`error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
	}
	return shader;
}