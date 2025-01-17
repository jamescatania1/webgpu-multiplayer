import { mat4, vec3 } from "gl-matrix";

export default class Camera {
	public position = vec3.create();
	public fov = 85;
	public near = 0.1;
	public far = 100.0;
	public pitch = 0.0;
	public yaw = 0.0;
	public roll = 0.0;

	public readonly up = vec3.fromValues(0, 1, 0);
	public readonly forward = vec3.create();
	public readonly right = vec3.create();
	private readonly negativePos = vec3.create();
	private readonly viewMatrix = mat4.create();
	private readonly projMatrix = mat4.create();
	public readonly viewProjMatrix = mat4.create();
	public readonly rotProjMatrix = mat4.create();

	constructor(gl: WebGL2RenderingContext) {
		this.update(gl);
	}

	public update(gl: WebGL2RenderingContext) {
		this.forward[0] = Math.cos(this.yaw - Math.PI / 2.0);
		this.forward[1] = Math.tan(this.pitch);
		this.forward[2] = Math.sin(this.yaw - Math.PI / 2.0);
		vec3.normalize(this.forward, this.forward);
		this.right[0] = Math.cos(this.yaw - Math.PI);
		this.right[1] = 0;
		this.right[2] = Math.sin(this.yaw - Math.PI);
		vec3.cross(this.up, this.forward, this.right);

		if (gl.canvas.width != window.innerWidth || gl.canvas.height != window.innerHeight) {
			gl.canvas.width = window.innerWidth;
			gl.canvas.height = window.innerHeight;
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		}

		mat4.perspective(
			this.projMatrix,
			(this.fov * Math.PI) / 180,
			gl.canvas.width / gl.canvas.height,
			this.near,
			this.far,
		);
		mat4.lookAt(this.viewMatrix, this.position, vec3.add(vec3.create(), this.position, this.forward), this.up);
		mat4.mul(this.viewProjMatrix, this.projMatrix, this.viewMatrix);

		mat4.lookAt(this.rotProjMatrix, vec3.create(), this.forward, this.up);
		mat4.mul(this.rotProjMatrix, this.projMatrix, this.rotProjMatrix);
	}
}
