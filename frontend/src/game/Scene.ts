import { vec2, vec3 } from "gl-matrix";
import Camera from "./Camera";
import Cube from "./Cube";
import type Input from "./Input";
import Model from "./Model";

type SceneContext = {
	gl: WebGLRenderingContext;
	scene: Scene;
	camera: Camera;
};

export interface SceneObject {
	update?(): void;
	draw(gl: WebGLRenderingContext, scene: Scene, camera: Camera): void;
}

const MAX_VEL = 1.0;
const ACCEL = 0.01;
const MOUSE_SENSITIVITY = 2.0;

export default class Scene {
	private camera: Camera;
	private ctx: SceneContext;
	private objects: SceneObject[] = [];

	private input: vec2 = vec2.create();
	private accel: vec3 = vec3.create();
	private vel: vec3 = vec3.create();
	private accelY: vec3 = vec3.create();

	constructor(gl: WebGLRenderingContext) {
		this.camera = new Camera(gl);
		this.ctx = {
			gl: gl,
			scene: this,
			camera: this.camera,
		};

		this.camera.position[2] = 4.5;
		this.camera.position[0] = -6.0;
		this.camera.position[1] = 3.0;
		// this.add(new Cube(gl));

		this.add(new Model(gl));

		gl.enable(gl.CULL_FACE);
	}

	public add(obj: SceneObject) {
		this.objects.push(obj);
	}

	public remove(obj: SceneObject) {
		this.objects.splice(this.objects.indexOf(obj), 1);
	}

	public draw(gl: WebGLRenderingContext, inputManager: Input, deltaTime: number) {
		// rotate camera with mouse delta
		if (inputManager.pointerLocked) {
			this.camera.yaw += inputManager.dx * MOUSE_SENSITIVITY;
			this.camera.pitch = Math.min(
				Math.PI / 2,
				Math.max(-Math.PI / 2, this.camera.pitch - inputManager.dy * MOUSE_SENSITIVITY),
			);
		}

		// get input vector
		vec2.set(
			this.input,
			(inputManager.keyDown("D") || inputManager.keyDown("d") ? 1 : 0) -
				(inputManager.keyDown("A") || inputManager.keyDown("a") ? 1 : 0),
			(inputManager.keyDown("W") || inputManager.keyDown("w") ? 1 : 0) -
				(inputManager.keyDown("S") || inputManager.keyDown("s") ? 1 : 0),
		);
		vec2.normalize(this.input, this.input);

		// update acceleration, velocity and position
		vec3.scale(this.accel, this.camera.right, -this.input[0]);
		vec3.scale(this.accelY, this.camera.forward, this.input[1]);
		vec3.add(this.accel, this.accel, this.accelY);

		vec3.set(this.vel,
			Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[0] + (this.accel[0] - this.vel[0]) * ACCEL * deltaTime)),
			Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[1] + (this.accel[1] - this.vel[1]) * ACCEL * deltaTime)),
			Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[2] + (this.accel[2] - this.vel[2]) * ACCEL * deltaTime)),
		)

		vec3.scaleAndAdd(this.camera.position, this.camera.position, this.vel, 0.01 * deltaTime);

		// clear everything
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clearDepth(1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// update camera (should be in update loop idk)
		this.camera.update(gl);

		// draw objects
		for (const obj of this.objects.values()) {
			obj.draw && obj.draw(gl, this, this.camera);
		}
	}
}
