import { vec3 } from "gl-matrix";
import type Camera from "./Camera";
import type Scene from "./Scene";
import type { SceneObject } from "./Scene";
import Shader from "./Shaders";
import Transform from "./Transform";

type ModelData = {
	vao: WebGLVertexArrayObject;
	vertexCount: number;
	indexType: GLenum;
	indexCount: number;
	triangleCount: number;
	scale: number;
	offset: vec3;
	hasColor: boolean;
	hasUV: boolean;
	hasNormal: boolean;
};

enum ModelReadState {
	IndexSize,
	VertexComponents,
	ScaleFactor,
	ModelOffset,
	VertexCount,
	IndexCount,
	VertexData,
	IndexData,
	Done,
}

const loadBOBJ = (gl: WebGL2RenderingContext, url: string, shader: Shader): Promise<ModelData> => {
	const startTime = performance.now();
	const debug = true;

	let readState = ModelReadState.IndexSize;

	let indexSize: number;
	let hasColor: boolean;
	let hasUV: boolean;
	let hasNormal: boolean;
	let scale = 1.0;
	let offset = vec3.create();

	let vertexCount: number;
	let vertexBufferSize: number;
	let vertices: Uint32Array;
	let vertexWriteIndex = 0;
	
	let triangleCount: number;
	let indexCount: number;
	let indices: any;
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

					let stride = hasUV && hasNormal ? 16 : hasUV || hasNormal ? 12 : 8;

					gl.vertexAttribIPointer(shader.attributes.vertex_xyzc, 2, gl.UNSIGNED_INT, stride, 0);
					gl.enableVertexAttribArray(shader.attributes.vertex_xyzc);

					if (hasNormal) {
						gl.vertexAttribIPointer(shader.attributes.vertex_normal, 1, gl.UNSIGNED_INT, stride, 8);
						gl.enableVertexAttribArray(shader.attributes.vertex_normal);
					} else {
						gl.disableVertexAttribArray(shader.attributes.vertex_normal);
					}
					if (hasUV) {
						const offset = hasNormal ? 12 : 8;
						gl.vertexAttribIPointer(shader.attributes.vertex_uv, 1, gl.UNSIGNED_INT, stride, offset);
						gl.enableVertexAttribArray(shader.attributes.vertex_uv);
					} else {
						gl.disableVertexAttribArray(shader.attributes.vertex_uv);
					}

					// index buffer
					const indexBuffer = gl.createBuffer();
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
					gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

					gl.bindVertexArray(null);

					resolve({
						vao: vao,
						vertexCount: vertexCount,
						triangleCount: triangleCount,
						indexCount: indexCount,
						indexType:
							indexSize === 1 ? gl.UNSIGNED_BYTE : indexSize === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
						scale: scale,
						offset: offset,
						hasColor: hasColor,
						hasUV: hasUV,
						hasNormal: hasNormal,
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
				readState = ModelReadState.VertexComponents;

				indexSize = view.getUint8(0);
				if (debug) console.log("index size:", indexSize);
				readIndex += 1;
			}
			if (readState === ModelReadState.VertexComponents && chunkSize >= 1) {
				readState = ModelReadState.ScaleFactor;

				const componentMask = view.getUint8(readIndex);
				hasColor = (componentMask & 0x4) !== 0;
				hasNormal = (componentMask & 0x2) !== 0;
				hasUV = (componentMask & 0x1) !== 0;
				if (debug) {
					console.log("has color:", hasColor);
					console.log("has normal:", hasNormal);
					console.log("has uv:", hasUV);
				}
				readIndex += 1;
			}
			if (readState === ModelReadState.ScaleFactor && chunkSize - readIndex >= 8) {
				readState = ModelReadState.ModelOffset;

				scale = view.getFloat64(readIndex, true);
				if (debug) console.log("scale factor:", scale);
				readIndex += 8;
			}
			if (readState === ModelReadState.ModelOffset && chunkSize - readIndex >= 12) {
				readState = ModelReadState.VertexCount;

				offset[0] = view.getFloat32(readIndex, true);
				offset[1] = view.getFloat32(readIndex + 4, true);
				offset[2] = view.getFloat32(readIndex + 8, true);
				if (debug) console.log("model offset:", vec3.str(offset));
				readIndex += 12;
			}
			if (readState === ModelReadState.VertexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.IndexCount;

				vertexBufferSize = view.getUint32(readIndex, true);
				vertexCount = vertexBufferSize / (hasUV && hasNormal ? 4 : hasUV || hasNormal ? 3 : 2);
				vertices = new Uint32Array(vertexBufferSize);
				if (debug) {
					console.log("vertex buffer size (bytes):", vertexBufferSize * 4);
					console.log("vertex count:", vertexCount);
				}
				readIndex += 4;
			}
			if (readState === ModelReadState.IndexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.VertexData;

				indexCount = view.getUint32(readIndex, true);
				triangleCount = indexCount / 3;
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
				if (debug) console.log("triangle count:", triangleCount);
				readIndex += 4;
			}
			while (readState === ModelReadState.VertexData && chunkSize - readIndex >= 4) {
				if (vertexWriteIndex >= vertexBufferSize) {
					readState = ModelReadState.IndexData;
					if (debug) {
						console.log("done reading vertices");
						console.log(vertices);
					}
					break;
				}
				const vertex = view.getUint32(readIndex, true);
				vertices[vertexWriteIndex] = vertex;
				vertexWriteIndex += 1;
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
	public metallic = 0.0;
	public roughness = 0.025;
	public ao = 1.0;

	constructor(gl: WebGL2RenderingContext, url: string, shader: Shader) {
		this.transform = new Transform(gl);
		this.transform.update(gl);
		this.shader = shader;

		loadBOBJ(gl, url, this.shader)
			.then((data) => {
				this.modelData = data;
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
		gl.uniform3fv(this.shader.uniforms.offset, this.modelData.offset);
		gl.uniform1f(this.shader.uniforms.scale, 1.0 / this.modelData.scale);
		gl.uniformMatrix4fv(this.shader.uniforms.model_matrix, false, this.transform.matrix);
		gl.uniformMatrix3fv(this.shader.uniforms.normal_matrix, false, this.transform.normalMatrix);
		gl.uniform1f(this.shader.uniforms.metallic, this.metallic);
		gl.uniform1f(this.shader.uniforms.roughness, this.roughness);
		gl.uniform1f(this.shader.uniforms.ao, this.ao);

		gl.drawElements(gl.TRIANGLES, this.modelData.indexCount, this.modelData.indexType, 0);
	}
}
