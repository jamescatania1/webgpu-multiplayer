import { mat3, mat4, quat, vec3 } from "wgpu-matrix";

export default class Transform {
	public position = vec3.create();
	public rotation = vec3.create();
	public scale = vec3.fromValues(1, 1, 1);

	public readonly matrix = mat4.create();
	public readonly normalMatrix = mat3.create();
	public modelScale: number = 1;

	private finalScale = vec3.create();
	private quaternion = quat.create();
	private rotationMatrix = mat4.create();

	constructor() {
		this.update();
	}

	public update() {
		quat.fromEuler(this.rotation[0], this.rotation[1], this.rotation[2], "xyz", this.quaternion);
		vec3.scale(this.scale, this.modelScale, this.finalScale);
		mat4.identity(this.matrix);
		mat4.translation(this.position, this.matrix);
		mat4.fromQuat(this.quaternion, this.rotationMatrix);
		mat4.multiply(this.matrix, this.rotationMatrix, this.matrix);
		mat4.scale(this.matrix, this.finalScale, this.matrix);

		mat3.fromMat4(this.matrix, this.normalMatrix);
		mat3.translate(this.normalMatrix, this.normalMatrix);
		mat3.inverse(this.normalMatrix, this.normalMatrix);
	}
}
