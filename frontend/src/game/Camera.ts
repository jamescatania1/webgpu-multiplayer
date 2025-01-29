import { mat4, vec3 } from "wgpu-matrix";

export default class Camera {
	public position = vec3.create();
	public fov = 85;
	public near = 0.1;
	public far = 300.0;
	public pitch = 0.0;
	public yaw = 0.0;
	public roll = 0.0;

	public readonly up = vec3.fromValues(0, 1, 0);
	public readonly forward = vec3.create();
	public readonly right = vec3.create();
	public readonly projMatrix = mat4.create();
	public readonly projMatrixInverse = mat4.create();
	public readonly viewProjMatrix = mat4.create();
	public readonly rotProjMatrix = mat4.create();
	public readonly viewMatrix = mat4.create();

	constructor(canvas: HTMLCanvasElement) {
		this.position[1] = 2.0;
		this.update(canvas);
	}

	public update(canvas: HTMLCanvasElement) {
		this.forward[0] = Math.cos(this.yaw - Math.PI / 2.0);
		this.forward[1] = Math.tan(this.pitch);
		this.forward[2] = Math.sin(this.yaw - Math.PI / 2.0);
		vec3.normalize(this.forward, this.forward);
		this.right[0] = Math.cos(this.yaw - Math.PI);
		this.right[1] = 0;
		this.right[2] = Math.sin(this.yaw - Math.PI);
		vec3.cross(this.up, this.forward, this.right);
		
		mat4.perspective(
			(this.fov * Math.PI) / 180,
			canvas.width / canvas.height,
			this.near,
			this.far,
			this.projMatrix,
		);
		mat4.lookAt(this.position, vec3.add(this.position, this.forward, vec3.create()), this.up, this.viewMatrix);
		mat4.mul(this.projMatrix, this.viewMatrix, this.viewProjMatrix);
		mat4.invert(this.projMatrix, this.projMatrixInverse);

		mat4.lookAt(vec3.create(), this.forward, this.up, this.rotProjMatrix);
		mat4.mul(this.projMatrix, this.rotProjMatrix, this.rotProjMatrix);
	}
}
