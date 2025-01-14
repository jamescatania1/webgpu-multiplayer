type ShaderProgramSource = {
	vertex: string;
	fragment: string;
	attributes?: string[];
	uniforms?: string[];
};

export default class Shader {
	public readonly program: WebGLProgram;
	public readonly attributes: { [key: string]: GLint } = {};
	public readonly uniforms: { [key: string]: WebGLUniformLocation } = {};

	constructor(gl: WebGLRenderingContext, source: ShaderProgramSource) {
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

function loadShader(gl: WebGLRenderingContext, type: "vertex" | "fragment", source: string) {
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
