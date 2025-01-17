import { vec3 } from "gl-matrix";
import type Shader from "./Shaders";
import Camera from "./Camera";

export default class Lighting {
	public readonly sunPosition = vec3.fromValues(-5, 50, 10);
	public readonly sunColor = vec3.fromValues(1, 240.0 / 255.0, 214.0 / 255.0);

	private readonly skyboxTexture: WebGLTexture;
	private readonly skyboxShader: Shader;
	private readonly skyboxVAO: WebGLVertexArrayObject;
	private readonly camera: Camera;

	constructor(gl: WebGL2RenderingContext, camera: Camera, skyboxShader: Shader) {
		this.camera = camera;
		this.skyboxShader = skyboxShader;

		// load the skybox cubemap
		this.skyboxTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxTexture);
		gl.texImage2D(
			gl.TEXTURE_CUBE_MAP_POSITIVE_X,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([255, 0, 0, 255]),
		);

		const faces = [
			"/skybox_px.png",
			"/skybox_nx.png",
			"/skybox_py.png",
			"/skybox_ny.png",
			"/skybox_pz.png",
			"/skybox_nz.png",
		];
		for (let i = 0; i < faces.length; i++) {
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, 200, 200, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			const image = new Image();
			image.src = faces[i];
			image.onload = () => {
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxTexture);
				gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
			};
		}
		gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

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
	}

	public draw(gl: WebGL2RenderingContext) {
		gl.bindVertexArray(this.skyboxVAO);
		gl.useProgram(this.skyboxShader.program);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxTexture);
		gl.uniform1i(this.skyboxShader.uniforms.skybox, 0);

		gl.uniformMatrix4fv(this.skyboxShader.uniforms.rot_proj_matrix, false, this.camera.rotProjMatrix);

		gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
		gl.bindVertexArray(null);
	}
}
