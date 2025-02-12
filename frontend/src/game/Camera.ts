import { mat4, vec3, vec4, type Mat4, type Vec4 } from "wgpu-matrix";
import { SHADOW_SETTINGS, SUN_SETTINGS } from "./Renderer";

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
	private readonly stablePosition = vec3.create();
	private readonly stableViewMatrix = mat4.create();
	private readonly shadowProjMatrix = mat4.create();
	private readonly center = vec3.create();
	private readonly shadowEye = vec3.create();
	private readonly shadowOrigin = vec4.create();
	private readonly roundedOrigin = vec4.create();
	private readonly roundedOffset = vec4.create();

	constructor(canvas: HTMLCanvasElement) {
		this.position[1] = 2.0;
		this.cascadeMatrices = SHADOW_SETTINGS.cascades.map((_) => {
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

		if (vec3.distSq(this.stablePosition, this.position) > 0.01) {
			vec3.copy(this.position, this.stablePosition);
		}

		mat4.lookAt(this.stablePosition, vec3.add(this.stablePosition, this.forward, vec3.create()), this.up, this.stableViewMatrix);

		mat4.lookAt(vec3.create(), this.forward, this.up, this.rotProjMatrix);
		mat4.mul(this.projMatrix, this.rotProjMatrix, this.rotProjMatrix);
	}

	public updateShadows(canvas: HTMLCanvasElement) {
		for (let c = 0; c < SHADOW_SETTINGS.cascades.length; c++) {
			mat4.perspective(
				(this.fov * Math.PI) / 180,
				canvas.width / canvas.height,
				SHADOW_SETTINGS.cascades[c].near,
				SHADOW_SETTINGS.cascades[c].far,
				this.shadowProjMatrix,
			);
			mat4.mul(this.shadowProjMatrix, this.stableViewMatrix, this.shadowProjMatrix);
			mat4.invert(this.shadowProjMatrix, this.shadowProjMatrix);

			vec4.zero(this.center);
			for (let i = 0; i < 8; i++) {
				vec4.zero(this.corners[i]);
				mat4.multiply(this.shadowProjMatrix, this.clipCorners[i], this.corners[i]);
				vec4.divScalar(this.corners[i], this.corners[i][3], this.corners[i]);
				vec4.add(this.center, this.corners[i], this.center);
			}

			vec4.divScalar(this.center, 8, this.center);

			let radius = 0;
			for (let i = 0; i < 8; i++) {
				radius = Math.max(radius, vec3.distance(this.center, this.corners[i]));
			}
			radius = Math.ceil(radius);

			vec3.add(this.center, SUN_SETTINGS.direction, this.shadowEye);
			mat4.lookAt(this.shadowEye, this.center, this.up, this.cascadeMatrices[c].view);

			const minOrtho = vec3.fromValues(-radius, -radius, -radius);
			const maxOrtho = vec3.fromValues(radius, radius, radius);
			vec3.add(this.center, minOrtho, minOrtho);
			vec3.add(this.center, maxOrtho, maxOrtho);

			const minComponents = mat4.multiply(this.cascadeMatrices[c].view, vec4.fromValues(minOrtho[0], minOrtho[1], minOrtho[2], 1.0));
			const maxComponents = mat4.multiply(this.cascadeMatrices[c].view, vec4.fromValues(maxOrtho[0], maxOrtho[1], maxOrtho[2], 1.0));
			
			const near = minComponents[2] * (minComponents[2] < 0 ? 10.0 : 0.1);
			const far = maxComponents[2] * (maxComponents[2] < 0 ? 0.1 : 10.0);
			mat4.ortho(
				-radius,
				radius,
				-radius,
				radius,
				near,
				far,
				this.cascadeMatrices[c].proj,
			);

			// stabilize the cascade matrices
			mat4.mul(this.cascadeMatrices[c].proj, this.cascadeMatrices[c].view, this.shadowProjMatrix);
			vec4.set(0, 0, 0, 1, this.shadowOrigin);
			vec4.transformMat4(this.shadowOrigin, this.shadowProjMatrix, this.shadowOrigin);
			const w = this.shadowOrigin[3];
			vec4.mulScalar(this.shadowOrigin, SHADOW_SETTINGS.resolution / 2.0, this.shadowOrigin);

			vec4.set(
				Math.round(this.shadowOrigin[0]),
				Math.round(this.shadowOrigin[1]),
				Math.round(this.shadowOrigin[2]),
				Math.round(this.shadowOrigin[3]),
				this.roundedOrigin,
			);
			vec4.sub(this.shadowOrigin, this.roundedOrigin, this.roundedOffset);
			vec4.mulScalar(this.roundedOffset, 2.0 / SHADOW_SETTINGS.resolution, this.roundedOffset);
			this.cascadeMatrices[c].proj[12] += this.roundedOffset[0];
			this.cascadeMatrices[c].proj[13] += this.roundedOffset[1];
			this.cascadeMatrices[c].proj[14] += this.roundedOffset[2];
			
	
			// vec3.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, this.minComponents);
			// vec3.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE, this.maxComponents);
			// for (const corner of this.corners) {
			// 	mat4.multiply(this.cascadeMatrices[c].view, corner, corner);
			// 	for (let k = 0; k < 3; k++) {
			// 		this.minComponents[k] = Math.min(this.minComponents[k], corner[k]);
			// 		this.maxComponents[k] = Math.max(this.maxComponents[k], corner[k]);
			// 	}
			// }
	
			// const shadowZMultiplier = 10.0;
			// this.minComponents[2] *= this.minComponents[2] < 0 ? shadowZMultiplier : 1.0 / shadowZMultiplier;
			// this.maxComponents[2] *= this.maxComponents[2] < 0 ? 1.0 / shadowZMultiplier : shadowZMultiplier;
	
			// mat4.ortho(
			// 	this.minComponents[0],
			// 	this.maxComponents[0],
			// 	this.minComponents[1],
			// 	this.maxComponents[1],
			// 	this.minComponents[2],
			// 	this.maxComponents[2],
			// 	this.cascadeMatrices[c].proj,
			// );

			// // stabilize the cascade matrices
			// const diameter = vec3.distance(this.corners[0], this.corners[7]) / 2.0;
			// const meterTexels = diameter / SHADOW_SETTINGS.resolution;

			// const shadowOrigin = vec4.fromValues(0, 0, 0, 1);
			// vec4.transformMat4(shadowOrigin, this.shadowProjMatrix, shadowOrigin);
			// vec4.divScalar(shadowOrigin, meterTexels, shadowOrigin);
		}
	}
}
