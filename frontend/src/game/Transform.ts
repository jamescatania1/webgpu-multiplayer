import { mat3, mat4, quat, vec3 } from "wgpu-matrix";
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

	constructor(camera: Camera) {
		this.update(camera);
	}

	public update(camera: Camera) {
		quat.fromEuler(this.rotation[0], this.rotation[1], this.rotation[2], "xyz", this.quaternion);
		mat4.identity(this.matrix);
		mat4.translation(this.position, this.matrix);
		mat4.fromQuat(this.quaternion, this.rotationMatrix);
		mat4.multiply(this.matrix, this.rotationMatrix, this.matrix);
		mat4.scale(this.matrix, this.scale, this.matrix);
		
		mat4.multiply(camera.viewMatrix, this.matrix, this.normalMatrix4);
		mat3.fromMat4(this.normalMatrix4, this.normalMatrix);
		mat3.inverse(this.normalMatrix, this.normalMatrix);
		mat3.transpose(this.normalMatrix, this.normalMatrix);
	}
}
