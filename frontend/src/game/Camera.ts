import { mat4, vec3, vec4, type Mat4, type Vec4 } from "wgpu-matrix";
import { SHADOW_SETTINGS, SUN_SETTINGS } from "./Renderer";

type CascadeTransform = {
	view: Mat4;
	proj: Mat4;
};

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
	public readonly frustum = {
		near: { normal: vec3.create(), point: vec3.create(), distance: 0 },
		far: { normal: vec3.create(), point: vec3.create(), distance: 0 },
		left: { normal: vec3.create(), point: vec3.create(), distance: 0 },
		right: { normal: vec3.create(), point: vec3.create(), distance: 0 },
		bottom: { normal: vec3.create(), point: vec3.create(), distance: 0 },
		top: { normal: vec3.create(), point: vec3.create(), distance: 0 },
	};

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
	private readonly minComponents = vec3.create();
	private readonly maxComponents = vec3.create();

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

		mat4.lookAt(
			this.stablePosition,
			vec3.add(this.stablePosition, this.forward, vec3.create()),
			this.up,
			this.stableViewMatrix,
		);

		mat4.lookAt(vec3.create(), this.forward, this.up, this.rotProjMatrix);
		mat4.mul(this.projMatrix, this.rotProjMatrix, this.rotProjMatrix);
	}

	public updateFrustum(canvas: HTMLCanvasElement) {
		vec3.addScaled(this.position, this.forward, this.near, this.frustum.near.point);
		this.frustum.near.normal.set(this.forward);
		vec3.normalize(this.frustum.near.normal, this.frustum.near.normal);
		this.frustum.near.distance = vec3.dot(this.frustum.near.normal, this.frustum.near.point);

		vec3.addScaled(this.position, this.forward, this.far, this.frustum.far.point);
		vec3.negate(this.forward, this.frustum.far.normal);
		vec3.normalize(this.frustum.far.normal, this.frustum.far.normal);
		this.frustum.far.distance = vec3.dot(this.frustum.far.normal, this.frustum.far.point);

		const vSideDistance = this.far * Math.tan((0.5 * this.fov * Math.PI) / 180);
		const hSideDistance = vSideDistance * (canvas.width / canvas.height);
		const frontMultFar = vec4.scale(this.forward, this.far);

		this.frustum.left.point.set(this.position);
		vec3.cross(this.up, vec3.addScaled(frontMultFar, this.right, hSideDistance), this.frustum.left.normal);
		vec3.normalize(this.frustum.left.normal, this.frustum.left.normal);
		this.frustum.left.distance = vec3.dot(this.frustum.left.normal, this.frustum.left.point);

		this.frustum.right.point.set(this.position);
		vec3.cross(vec3.subtract(frontMultFar, vec3.scale(this.right, hSideDistance)), this.up, this.frustum.right.normal);
		vec3.normalize(this.frustum.right.normal, this.frustum.right.normal);
		this.frustum.right.distance = vec3.dot(this.frustum.right.normal, this.frustum.right.point);

		this.frustum.top.point.set(this.position);
		vec3.cross(
			this.right,
			vec3.addScaled(vec3.scale(this.forward, this.far), this.up, -vSideDistance),
			this.frustum.top.normal,
		);
		vec3.normalize(this.frustum.top.normal, this.frustum.top.normal);
		this.frustum.top.distance = vec3.dot(this.frustum.top.normal, this.frustum.top.point);

		this.frustum.bottom.point.set(this.position);
		vec3.cross(
			vec3.addScaled(vec3.scale(this.forward, this.far), this.up, vSideDistance),
			this.right,
			this.frustum.bottom.normal,
		);
		vec3.normalize(this.frustum.bottom.normal, this.frustum.bottom.normal);
		this.frustum.bottom.distance = vec3.dot(this.frustum.bottom.normal, this.frustum.bottom.point);
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
		}
	}
}
