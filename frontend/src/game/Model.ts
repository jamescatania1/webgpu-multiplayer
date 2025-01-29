import { vec3, type Vec3 } from "wgpu-matrix";
import Transform from "./Transform";
import type Camera from "./Camera";

type ModelData = {
	vertexBuffer: GPUBuffer;
	vertexCount: number;
	indexBuffer: GPUBuffer;
	indexFormat: GPUIndexFormat;
	indexCount: number;
	triangleCount: number;
	scale: number;
	offset: Vec3;
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

export default class Model {
	public readonly modelData: ModelData;
	private readonly transformUniformBuffer: GPUBuffer;
	public readonly transformUniformBindGroup: GPUBindGroup;
	public readonly transform: Transform;
	private readonly transformBufferData: Float32Array;
	public metallic = 0.0;
	public roughness = 1.0;
	public ao = 1.0;

	constructor(device: GPUDevice, camera: Camera, transformBindGroupLayout: GPUBindGroupLayout, modelData: ModelData) {
		this.modelData = modelData;
		this.transform = new Transform(camera);
		this.transformBufferData = new Float32Array((16 + 12 + 4) * 4);

		// uniform buffer and bind group for the transform
		this.transformUniformBuffer = device.createBuffer({
			size: (16 + 12 + 4) * 4 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.transformUniformBindGroup = device.createBindGroup({
			layout: transformBindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: {
						buffer: this.transformUniformBuffer,
					},
				},
			],
		});

		this.update(device);
	}

	public update(device: GPUDevice) {
		if (!this.modelData) {
			return;
		}
		this.transformBufferData.set(this.transform.matrix, 0);
		this.transformBufferData.set(this.transform.normalMatrix, 16);
		this.transformBufferData.set(this.modelData.offset, 16 + 12);
		this.transformBufferData[16 + 12 + 3] = 1.0 / this.modelData.scale;
		device.queue.writeBuffer(
			this.transformUniformBuffer,
			0,
			this.transformBufferData.buffer,
			this.transformBufferData.byteOffset,
			this.transformBufferData.byteLength,
		);
	}
}

export async function loadBOBJ(device: GPUDevice, url: string): Promise<ModelData> {
	const startTime = performance.now();
	const debug = false;

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
						console.log(`Total time to load model: ${(performance.now() - startTime).toFixed(1)}ms`);
					}

					// vertex buffer
					const vertexBuffer = device.createBuffer({
						label: `vertex buffer ${url}`,
						size: vertices.byteLength,
						usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
						mappedAtCreation: true,
					});
					new Uint32Array(vertexBuffer.getMappedRange()).set(vertices);
					vertexBuffer.unmap();

					// index buffer
					const indexBuffer = device.createBuffer({
						label: `index buffer ${url}`,
						size: indices.byteLength,
						usage: GPUBufferUsage.INDEX,
						mappedAtCreation: true,
					});
					if (indexSize === 2) {
						new Uint16Array(indexBuffer.getMappedRange()).set(indices);
					} else if (indexSize === 4) {
						new Uint32Array(indexBuffer.getMappedRange()).set(indices);
					} else {
						throw new Error(`Received ${indexSize} size indices for model ${url}. Must be either 2 or 4`);
					}
					indexBuffer.unmap();

					resolve({
						vertexBuffer: vertexBuffer,
						vertexCount: vertexCount,
						indexBuffer: indexBuffer,
						indexFormat: indexSize === 2 ? "uint16" : "uint32",
						indexCount: indexCount,
						triangleCount: triangleCount,
						scale: scale,
						offset: offset,
						hasColor: hasColor,
						hasUV: hasUV,
						hasNormal: hasNormal,
					});

					// let stride = hasUV && hasNormal ? 16 : hasUV || hasNormal ? 12 : 8;
					// gl.vertexAttribIPointer(shader.attributes.vertex_xyzc, 2, gl.UNSIGNED_INT, stride, 0);
					// gl.enableVertexAttribArray(shader.attributes.vertex_xyzc);

					// if (hasNormal) {
					// 	gl.vertexAttribIPointer(shader.attributes.vertex_normal, 1, gl.UNSIGNED_INT, stride, 8);
					// 	gl.enableVertexAttribArray(shader.attributes.vertex_normal);
					// } else {
					// 	gl.disableVertexAttribArray(shader.attributes.vertex_normal);
					// }
					// if (hasUV) {
					// 	const offset = hasNormal ? 12 : 8;
					// 	gl.vertexAttribIPointer(shader.attributes.vertex_uv, 1, gl.UNSIGNED_INT, stride, offset);
					// 	gl.enableVertexAttribArray(shader.attributes.vertex_uv);
					// } else {
					// 	gl.disableVertexAttribArray(shader.attributes.vertex_uv);
					// }

					// // depth vao
					// const depthVAO = gl.createVertexArray();
					// gl.bindVertexArray(depthVAO);
					// const depthVertexBuffer = gl.createBuffer();
					// gl.bindBuffer(gl.ARRAY_BUFFER, depthVertexBuffer);
					// gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
					// gl.vertexAttribIPointer(depthShader.attributes.vertex_xyzc, 2, gl.UNSIGNED_INT, stride, 0);
					// gl.enableVertexAttribArray(depthShader.attributes.vertex_xyzc);
					// gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
					// gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
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
		let trailingChunkData: Uint8Array<ArrayBufferLike> | null = null;
		return readChunk();

		function readChunk() {
			return reader.read().then(appendChunks);
		}

		function appendChunks({ done, value }: ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>): any {
			if (done || !value) {
				return;
			}
			if (trailingChunkData && trailingChunkData.length > 0) {
				const newChunk = new Uint8Array(trailingChunkData.length + value.byteLength);
				newChunk.set(trailingChunkData);
				newChunk.set(value, trailingChunkData.length);
				value = newChunk;
				trailingChunkData = null;
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
				if (debug) console.log("model offset:", `(${offset[0]}, ${offset[1]}, ${offset[2]})`);
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

			if (readIndex < chunkSize) {
				trailingChunkData = new Uint8Array(value.buffer.slice(readIndex));
			}
			if (debug) console.log("reading next chunk");
			return readChunk();
		}
	}
}
