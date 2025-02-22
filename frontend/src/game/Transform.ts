import { mat3, mat4, quat, vec3, vec4, type Vec3 } from "wgpu-matrix";
import type Camera from "./Camera";

export default class Transform {
	public position = vec3.create();
	public rotation = vec3.create();
	public scale = vec3.fromValues(1, 1, 1);

	public readonly matrix = mat4.create();
	public readonly normalMatrix = mat3.create();

	private readonly quaternion = quat.create();
	private readonly rotationMatrix = mat4.create();
	private readonly normalMatrix4 = mat4.create();

	private readonly modelOffset: Vec3;
	private readonly modelScale: Vec3;

	constructor(camera: Camera, modelOffset: Vec3, modelScale: Vec3) {
		this.modelOffset = modelOffset;
		this.modelScale = modelScale;
		this.update(camera);
	}

	public update(camera: Camera) {
		quat.fromEuler(this.rotation[0], this.rotation[1], this.rotation[2], "xyz", this.quaternion);
		mat4.identity(this.matrix);
		mat4.translation(this.position, this.matrix);
		mat4.fromQuat(this.quaternion, this.rotationMatrix);
		mat4.multiply(this.matrix, this.rotationMatrix, this.matrix);
		mat4.scale(this.matrix, this.scale, this.matrix);

		// let world_pos: vec4<f32> = transform.model_matrix * vec4<f32>(vec3<f32>(x, y, z) * transform.model_scale + transform.model_offset, 1.0);

		const offsetMatrix = mat4.identity();
		mat4.scale(offsetMatrix, this.modelScale, offsetMatrix);
		mat4.translate(offsetMatrix, this.modelOffset, offsetMatrix);

		mat4.identity(this.normalMatrix4);
		mat4.translation(this.position, this.normalMatrix4);
		mat4.multiply(this.normalMatrix4, this.rotationMatrix, this.normalMatrix4);
		mat4.scale(this.normalMatrix4, this.scale, this.normalMatrix4);
		// mat4.mul(this.normalMatrix4, offsetMatrix, this.normalMatrix4);

		// mat4.mul(this.projMatrix, this.viewMatrix, this.viewProjMatrix);

		
		mat3.fromMat4(this.normalMatrix4, this.normalMatrix);
		mat3.inverse(this.normalMatrix, this.normalMatrix);
		mat3.transpose(this.normalMatrix, this.normalMatrix);
	}
}
