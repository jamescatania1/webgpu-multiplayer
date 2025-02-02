import { mat4, vec3, vec4, type Mat4, type Vec4 } from "wgpu-matrix";
import { shadowSettings, sunSettings } from "./Renderer";

type CascadeTransform = {
	view: Mat4,
	proj: Mat4,
}

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
	public readonly viewMatrix = mat4.create();
	public readonly projMatrix = mat4.create();
	public readonly projMatrixInverse = mat4.create();
	public readonly viewProjMatrix = mat4.create();
	public readonly rotProjMatrix = mat4.create();
	public readonly cascadeMatrices: CascadeTransform[];

	// used to build the shadow camera matrices
	private readonly clipCorners: Vec4[] = [
		vec4.fromValues(-1, -1, 0, 1),
		vec4.fromValues(-1, -1, 1, 1),
		vec4.fromValues(-1, 1, 0, 1),
		vec4.fromValues(-1, 1, 1, 1),
		vec4.fromValues(1, -1, 0, 1),
		vec4.fromValues(1, -1, 1, 1),
		vec4.fromValues(1, 1, 0, 1),
		vec4.fromValues(1, 1, 1, 1),
	];
	private readonly corners: Vec4[] = [
		vec4.fromValues(-1, -1, 0, 1.0),
		vec4.fromValues(-1, -1, 1, 1.0),
		vec4.fromValues(-1, 1, 0, 1.0),
		vec4.fromValues(-1, 1, 1, 1.0),
		vec4.fromValues(1, -1, 0, 1.0),
		vec4.fromValues(1, -1, 1, 1.0),
		vec4.fromValues(1, 1, 0, 1.0),
		vec4.fromValues(1, 1, 1, 1.0),
	];
	private readonly center = vec4.create();
	private readonly centerXYZ = vec3.create();
	private readonly shadowEye = vec3.create();
	private readonly minComponents = vec3.create();
	private readonly maxComponents = vec3.create();

	constructor(canvas: HTMLCanvasElement) {
		this.position[1] = 2.0;
		this.cascadeMatrices = shadowSettings.cascades.map((_) => {
			return {
				view: mat4.create(),
				proj: mat4.create(),
			};
		});

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

		// update the shadow camera matrices
		for (let c = 0; c < shadowSettings.cascades.length; c++) {
			mat4.perspective(
				(this.fov * Math.PI) / 180,
				canvas.width / canvas.height,
				shadowSettings.cascades[c].near,
				shadowSettings.cascades[c].far,
				this.cascadeMatrices[c].proj
			);
			mat4.mul(this.cascadeMatrices[c].proj, this.viewMatrix, this.cascadeMatrices[c].proj);
			mat4.invert(this.cascadeMatrices[c].proj, this.cascadeMatrices[c].proj);

			vec4.zero(this.center);
			for (let i = 0; i < 8; i++) {
				vec4.zero(this.corners[i]);
				mat4.multiply(this.cascadeMatrices[c].proj, this.clipCorners[i], this.corners[i]);
				vec4.divScalar(this.corners[i], this.corners[i][3], this.corners[i]);
				vec4.add(this.center, this.corners[i], this.center);
			}
			vec4.divScalar(this.center, 8, this.center);
			vec3.set(this.center[0], this.center[1], this.center[2], this.centerXYZ);
			vec3.add(this.centerXYZ, sunSettings.direction, this.shadowEye);
			mat4.lookAt(this.shadowEye, this.centerXYZ, this.up, this.cascadeMatrices[c].view);
	
			vec3.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, this.minComponents);
			vec3.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE, this.maxComponents);
			for (const corner of this.corners) {
				mat4.multiply(this.cascadeMatrices[c].view, corner, corner);
				for (let k = 0; k < 3; k++) {
					this.minComponents[k] = Math.min(this.minComponents[k], corner[k]);
					this.maxComponents[k] = Math.max(this.maxComponents[k], corner[k]);
				}
			}
	
			const shadowZMultiplier = 10.0;
			this.minComponents[2] *= this.minComponents[2] < 0 ? shadowZMultiplier : 1.0 / shadowZMultiplier;
			this.maxComponents[2] *= this.maxComponents[2] < 0 ? 1.0 / shadowZMultiplier : shadowZMultiplier;
	
			mat4.ortho(
				this.minComponents[0],
				this.maxComponents[0],
				this.minComponents[1],
				this.maxComponents[1],
				this.minComponents[2],
				this.maxComponents[2],
				this.cascadeMatrices[c].proj,
			);
		}
	}
}
