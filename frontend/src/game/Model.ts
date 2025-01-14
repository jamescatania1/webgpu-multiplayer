import type Camera from "./Camera";
import type Scene from "./Scene";
import type { SceneObject } from "./Scene";
import Shader from "./Shaders";

type ModelData = {
	vertexBuffer: WebGLBuffer;
	indexBuffer: WebGLBuffer;
	indexCount: number;
	indexType: GLenum;
};

enum ModelReadState {
	IndexSize,
	VertexCount,
	TexCoordCount,
	NormalCount,
	VertIndexCount,
	TexIndexCount,
	NormIndexCount,
	VertexData,
	TexCoordData,
	NormalData,
	VertIndexData,
	TexIndexData,
	NormIndexData,
	Done,
}

const loadBOBJ = (gl: WebGLRenderingContext): Promise<ModelData> => {
	const url = "/monke-smooth.bobj";
	const startTime = performance.now();
	const debug = false;

	let readState = ModelReadState.IndexSize;

	let indexSize: number;
	let vertexCount: number;
	let texCoordCount: number;
	let normalCount: number;
	let vertIndexCount: number;
	let texIndexCount: number;
	let normIndexCount: number;

	let vertices: Float32Array;
	let vertexWriteIndex = 0;

	let texCoords: Float32Array;
	let texCoordWriteIndex = 0;

	let normals: Float32Array;
	let normalWriteIndex = 0;

	let vertIndices: any;
	let vertIndexWriteIndex = 0;

	let texIndices: any;
	let texIndexWriteIndex = 0;

	let normIndices: any;
	let normIndexWriteIndex = 0;

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
					// vertex buffer
					const vertexBuffer = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
					gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

					// index buffer
					const indexBuffer = gl.createBuffer();
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
					gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, vertIndices, gl.STATIC_DRAW);

					resolve({
						vertexBuffer: vertexBuffer,
						indexBuffer: indexBuffer,
						indexCount: vertIndexCount,
						indexType: indexSize === 1 ? gl.UNSIGNED_BYTE : indexSize === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
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
				readState = ModelReadState.VertexCount;

				indexSize = view.getUint8(0);
				if (debug) console.log("index size is", indexSize);
				readIndex += 1;
			}
			if (readState === ModelReadState.VertexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.TexCoordCount;

				vertexCount = view.getUint32(readIndex, true);
				vertices = new Float32Array(vertexCount);
				if (debug) console.log("vertex count is", vertexCount);
				readIndex += 4;
			}
			if (readState === ModelReadState.TexCoordCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.NormalCount;

				texCoordCount = view.getUint32(readIndex, true);
				texCoords = new Float32Array(texCoordCount);
				if (debug) console.log("tex coord count is", texCoordCount);
				readIndex += 4;
			}
			if (readState === ModelReadState.NormalCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.VertIndexCount;

				normalCount = view.getUint32(readIndex, true);
				normals = new Float32Array(normalCount);
				if (debug) console.log("normal count is", normalCount);
				readIndex += 4;
			}
			if (readState === ModelReadState.VertIndexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.TexIndexCount;

				vertIndexCount = view.getUint32(readIndex, true);
				switch (indexSize) {
					case 1:
						vertIndices = new Uint8Array(vertIndexCount);
						break;
					case 2:
						vertIndices = new Uint16Array(vertIndexCount);
						break;
					default:
						vertIndices = new Uint32Array(vertIndexCount);
						break;
				}
				if (debug) console.log("vert index count is", vertIndexCount);
				readIndex += 4;
			}
			if (readState === ModelReadState.TexIndexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.NormIndexCount;

				texIndexCount = view.getUint32(readIndex, true);
				switch (indexSize) {
					case 1:
						texIndices = new Uint8Array(texIndexCount);
						break;
					case 2:
						texIndices = new Uint16Array(texIndexCount);
						break;
					default:
						texIndices = new Uint32Array(texIndexCount);
						break;
				}
				if (debug) console.log("tex index count is", texIndexCount);
				readIndex += 4;
			}
			if (readState === ModelReadState.NormIndexCount && chunkSize - readIndex >= 4) {
				readState = ModelReadState.VertexData;

				normIndexCount = view.getUint32(readIndex, true);
				switch (indexSize) {
					case 1:
						normIndices = new Uint8Array(normIndexCount);
						break;
					case 2:
						normIndices = new Uint16Array(normIndexCount);
						break;
					default:
						normIndices = new Uint32Array(normIndexCount);
						break;
				}
				if (debug) console.log("norm index count is", normIndexCount);
				readIndex += 4;
			}
			while (readState === ModelReadState.VertexData && chunkSize - readIndex >= 4) {
				if (vertexWriteIndex >= vertexCount) {
					readState = ModelReadState.TexCoordData;
					if (debug) {
						console.log("done reading vertices");
						console.log(vertices);
					}
					break;
				}
				const vertex = view.getFloat32(readIndex, true);
				vertices[vertexWriteIndex] = vertex;
				vertexWriteIndex += 1;
				readIndex += 4;
			}
			while (readState === ModelReadState.TexCoordData && chunkSize - readIndex >= 4) {
				if (texCoordWriteIndex >= vertexCount) {
					readState = ModelReadState.NormalData;
					if (debug) {
						console.log("done reading texture coordinates");
						console.log(texCoords);
					}
					break;
				}
				const coord = view.getFloat32(readIndex, true);
				texCoords[texCoordWriteIndex] = coord;
				texCoordWriteIndex += 1;
				readIndex += 4;
			}
			while (readState === ModelReadState.NormalData && chunkSize - readIndex >= 4) {
				if (normalWriteIndex >= vertexCount) {
					readState = ModelReadState.VertIndexData;
					if (debug) {
						console.log("done reading normals");
						console.log(normals);
					}
					break;
				}
				const norm = view.getFloat32(readIndex, true);
				normals[normalWriteIndex] = norm;
				normalWriteIndex += 1;
				readIndex += 4;
			}
			while (readState === ModelReadState.VertIndexData && chunkSize - readIndex >= indexSize) {
				if (vertIndexWriteIndex >= vertexCount) {
					readState = ModelReadState.Done;
					if (debug) {
						console.log("done reading vertex indices");
						console.log(vertIndices);
					}
					break;
				}
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
				vertIndices[vertIndexWriteIndex] = index;
				vertIndexWriteIndex += 1;
				readIndex += indexSize;
			}

			if (debug) console.log("reading next chunk");
			return readChunk();
		}
	}
};

export default class Model implements SceneObject {
	private shader: Shader;
	private modelData: ModelData | null = null;

	constructor(gl: WebGLRenderingContext) {
		loadBOBJ(gl)
        .then((data) => {
            this.modelData = data;
		})
        .catch((err) => {
            throw new Error(`Error loading model: ${err}`);
        });

		// make the shader
		const vertexShader = `
            attribute vec3 vertex_pos;

            uniform mat4 view_proj_matrix;

            void main() {
                gl_Position = view_proj_matrix * vec4(vertex_pos, 1.0);
            }
        `;
		const fragShader = `
            void main() {
                gl_FragColor = vec4(0.5, 1.0, 1.0, 1.0);
            }
        `;
		this.shader = new Shader(gl, {
			vertex: vertexShader,
			fragment: fragShader,
			attributes: ["vertex_pos"],
			uniforms: ["view_proj_matrix"],
		});
	}

	public draw(gl: WebGLRenderingContext, scene: Scene, camera: Camera) {
        if (!this.modelData) {
            return;
        }

		// position buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.modelData.vertexBuffer);
		gl.vertexAttribPointer(this.shader.attributes.vertex_pos, 3, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.shader.attributes.vertex_pos);

		gl.useProgram(this.shader.program);

		// uniforms
		gl.uniformMatrix4fv(this.shader.uniforms.view_proj_matrix, false, camera.viewProjMatrix);

		gl.drawElements(gl.TRIANGLE_STRIP, this.modelData.indexCount, this.modelData.indexType, 0);
	}
}
