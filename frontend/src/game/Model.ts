import { vec3 } from "gl-matrix";
import type Camera from "./Camera";
import type Scene from "./Scene";
import type { SceneObject } from "./Scene";
import Shader from "./Shaders";
import Transform from "./Transform";

type ModelData = {
	vao: WebGLVertexArrayObject;
	indexCount: number;
	indexType: GLenum;
	scaleFactor: number;
	hasColor: boolean;
};

enum ModelReadState {
	IndexSize,
	HasColor,
	ScaleFactor,
	VertexCount,
	IndexCount,
	VertexData,
	IndexData,
	Done,
}

const loadBOBJ = (gl: WebGL2RenderingContext, url: string, shader: Shader): Promise<ModelData> => {
	const startTime = performance.now();
	const debug = false;

	let readState = ModelReadState.IndexSize;

	let indexSize: number;
	let hasColor: boolean;
	let scaleFactor = 1.0;

	let vertices: Uint32Array;
	let vertexCount: number;
	let verticesWriteIndex = 0;

	let indices: any;
	let indexCount: number;
	let indicesWriteIndex = 0;

	return new Promise((resolve, reject) => {
		try {
			fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/octet-stream",
				},
			})
				.then(readChunks)
				.then(() => {
					if (debug) {
						console.log("Done reading file");
						console.log(`Total time to load model: ${(performance.now() - startTime) / 1000} seconds`);
					}
					// vao
					const vao = gl.createVertexArray();
					gl.bindVertexArray(vao);

					// vertex buffer
					const vertexBuffer = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
					gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
					gl.vertexAttribIPointer(shader.attributes.vertex_data, 3, gl.UNSIGNED_INT, 0, 0);
					gl.enableVertexAttribArray(shader.attributes.vertex_data);

					// index buffer
					const indexBuffer = gl.createBuffer();
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
					gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

					gl.bindVertexArray(null);

					resolve({
						vao: vao,
						indexCount: indexCount,
						indexType:
							indexSize === 1 ? gl.UNSIGNED_BYTE : indexSize === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
						scaleFactor: scaleFactor,
						hasColor: hasColor,
					});
				})
				.catch((err) => {
					reject(`Error loading file ${url}, ${err}`);
				});
		} catch (err) {
			reject(`Error loading file ${url}, ${err}`);
		}
	});

	function readChunks(response: Response) {
		if (!response.ok || response.body === null) {
			throw new Error(
				`Failed to load model: ${url}` + !response.ok && `. Server responded with status ${response.status}.`,
			);
		}
		const reader = response.body.getReader();
		return readChunk();

		function readChunk() {
			return reader.read().then(appendChunks);
		}

		function appendChunks({ done, value }: ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>): any {
			if (done || !value) {
				return;
			}

			const chunkSize = value.byteLength;
			const view = new DataView(value.buffer);
			let readIndex = 0;
			if (readState === ModelReadState.IndexSize && chunkSize >= 1) {
				readState = ModelReadState.HasColor;

				indexSize = view.getUint8(0);
				if (debug) console.log("index size:", indexSize);
				readIndex += 1;
			}
			if (readState === ModelReadState.HasColor && chunkSize >= 1) {
				readState = ModelReadState.ScaleFactor;

				hasColor = view.getUint8(0) === 1;
				if (debug) console.log("has color:", hasColor);
				readIndex += 1;
			}
			if (readState === ModelReadState.ScaleFactor && chunkSize - readIndex >= 8) {
				readState = ModelReadState.VertexCount;

				scaleFactor = view.getFloat64(readIndex, true);
				if (debug) console.log("scale factor:", scaleFactor);
				readIndex += 8;
			}
			if (readState === ModelReadState.VertexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.IndexCount;

				vertexCount = view.getUint32(readIndex, true);
				vertices = new Uint32Array(vertexCount);
				if (debug) console.log("vertex count (packed):", vertexCount);
				readIndex += 4;
			}
			if (readState === ModelReadState.IndexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.VertexData;

				indexCount = view.getUint32(readIndex, true);
				switch (indexSize) {
					case 1:
						indices = new Uint8Array(indexCount);
						break;
					case 2:
						indices = new Uint16Array(indexCount);
						break;
					default:
						indices = new Uint32Array(indexCount);
						break;
				}
				if (debug) console.log("index count:", indexCount);
				readIndex += 4;
			}
			while (readState === ModelReadState.VertexData && chunkSize - readIndex >= 4) {
				if (verticesWriteIndex >= vertexCount) {
					readState = ModelReadState.IndexData;
					if (debug) {
						console.log("done reading vertices");
						console.log(vertices);
					}
					break;
				}
				const vertex = view.getUint32(readIndex, true);
				vertices[verticesWriteIndex] = vertex;
				verticesWriteIndex += 1;
				readIndex += 4;
			}
			while (
				readState === ModelReadState.IndexData &&
				chunkSize - readIndex >= indexSize &&
				indicesWriteIndex < indexCount
			) {
				let index: any;
				switch (indexSize) {
					case 1:
						index = view.getUint8(readIndex);
						break;
					case 2:
						index = view.getUint16(readIndex, true);
						break;
					default:
						index = view.getUint32(readIndex, true);
						break;
				}
				indices[indicesWriteIndex] = index;
				indicesWriteIndex += 1;
				readIndex += indexSize;

				if (indicesWriteIndex >= indexCount) {
					readState = ModelReadState.Done;
					if (debug) {
						console.log("done reading vertex indices");
						console.log(indices);
					}
				}
			}

			if (debug) console.log("reading next chunk");
			return readChunk();
		}
	}
};

export default class Model implements SceneObject {
	private shader: Shader;
	private modelData: ModelData | null = null;

	public transform: Transform;
	public isMetal = false;
	public roughness = 0.025;
	public ao = 1.0;

	constructor(gl: WebGL2RenderingContext, url: string, shader: Shader) {
		this.transform = new Transform(gl);
		this.transform.update(gl);
		this.shader = shader;

		loadBOBJ(gl, url, this.shader)
			.then((data) => {
				this.modelData = data;
				// vec3.scale(this.transform.scale, this.transform.scale, 1.0 / data.scaleFactor);
				this.transform.modelScale = 1.0 / data.scaleFactor;
				this.transform.update(gl);
			})
			.catch((err) => {
				throw new Error(`Error loading model: ${err}`);
			});
	}

	public draw(gl: WebGL2RenderingContext, scene: Scene, camera: Camera) {
		if (!this.modelData) {
			return;
		}
		
		// position buffer
		gl.bindVertexArray(this.modelData.vao);
		gl.useProgram(this.shader.program);

		// uniforms
		gl.uniformMatrix4fv(this.shader.uniforms.model_matrix, false, this.transform.matrix);
		gl.uniformMatrix3fv(this.shader.uniforms.normal_matrix, false, this.transform.normalMatrix);
		gl.uniform1i(this.shader.uniforms.is_metallic, this.isMetal ? 1 : 0);
		gl.uniform1f(this.shader.uniforms.roughness, this.roughness);
		gl.uniform1f(this.shader.uniforms.ao, this.ao);
		
		gl.drawElements(gl.TRIANGLES, this.modelData.indexCount, this.modelData.indexType, 0);
	}
}
