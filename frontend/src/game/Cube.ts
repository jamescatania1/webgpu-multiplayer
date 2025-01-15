import type Camera from "./Camera";
import type Scene from "./Scene";
import type { SceneObject } from "./Scene";
import Shader from "./Shaders";

export default class Cube implements SceneObject {
	private shader: Shader;
	private vertexBuffer: WebGLBuffer;
    private colorBuffer: WebGLBuffer;
	private indexBuffer: WebGLBuffer;
    private numIndices: number;

	constructor(gl: WebGL2RenderingContext) {

        // make the shader
		const vertexShader = `
            attribute vec4 vertex_pos;
            attribute vec4 vertex_color;

            uniform mat4 view_proj_matrix;

            varying lowp vec4 color;

            void main() {
                gl_Position = view_proj_matrix * vertex_pos;
                color = vertex_color;
            }
        `;
		const fragShader = `
            varying lowp vec4 color;

            void main() {
                gl_FragColor = color;
            }
        `;
		this.shader = new Shader(gl, {
			vertex: vertexShader,
			fragment: fragShader,
			attributes: ["vertex_pos", "vertex_color"],
			uniforms: ["view_proj_matrix"],
		});

        // vertex buffer
		const vertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
                1.0,	1.0,	1.0,
                0.0,	1.0,	1.0,
                1.0,	1.0,	0.0,
                0.0,	1.0,	0.0,
                1.0,	0.0,	1.0,
                0.0,	0.0,	1.0,
                0.0,	0.0,	0.0,
                1.0,	0.0,	0.0
            ]),
			gl.STATIC_DRAW,
		);
		this.vertexBuffer = vertexBuffer;

        // color buffer
        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				1.0, 1.0, 1.0, 1.0, // white
				1.0, 0.0, 0.0, 1.0, // red
				0.0, 1.0, 0.0, 1.0, // green
				0.0, 0.0, 1.0, 1.0, // blue
				1.0, 1.0, 1.0, 1.0, // white
				1.0, 0.0, 0.0, 1.0, // red
				0.0, 1.0, 0.0, 1.0, // green
				0.0, 0.0, 1.0, 1.0, // blue
			]),
			gl.STATIC_DRAW,
		);
		this.colorBuffer = colorBuffer;

        // index buffer
        const indices = new Uint8Array([
            3, 2, 6, 7, 4, 2, 0,
            3, 1, 6, 5, 4, 1, 0
        ]);
		const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            indices,
            gl.STATIC_DRAW,
        )
        this.indexBuffer = indexBuffer;
        this.numIndices = indices.length;
	}

	public draw(gl: WebGL2RenderingContext, scene: Scene, camera: Camera) {
		// position buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.vertexAttribPointer(this.shader.attributes.vertex_pos, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.shader.attributes.vertex_pos);

		// color buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
		gl.vertexAttribPointer(this.shader.attributes.vertex_color, 4, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.shader.attributes.vertex_color);

		gl.useProgram(this.shader.program);

		// uniforms
		gl.uniformMatrix4fv(this.shader.uniforms.view_proj_matrix, false, camera.viewProjMatrix);

		gl.drawElements(gl.TRIANGLE_STRIP, this.numIndices, gl.UNSIGNED_BYTE, 0);
	}
}
