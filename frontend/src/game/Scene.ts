import { vec2, vec3 } from "gl-matrix";
import Camera from "./Camera";
import Lighting from "./Lighting";
import Cube from "./Cube";
import type Input from "./Input";
import Model from "./Model";
import { loadShaders, type Shaders } from "./Shaders";
import { loadTextures, textures } from "./Resources";

export interface SceneObject {
	update?(): void;
	draw(gl: WebGL2RenderingContext, scene: Scene, camera: Camera): void;
}

const MAX_VEL = 1.0;
const ACCEL = 0.01;
const MOUSE_SENSITIVITY = 2.0;

export default class Scene {
	public readonly shaders: Shaders;

	private readonly camera: Camera;
	private readonly lighting: Lighting;
	private readonly ubo: WebGLBuffer;
	private readonly cameraUboBuffer: Float32Array = new Float32Array(20);
	private objects: SceneObject[] = [];
	private texturesLoaded = false;

	private readonly input: vec2 = vec2.create();
	private readonly accel: vec3 = vec3.create();
	private readonly vel: vec3 = vec3.create();
	private readonly accelY: vec3 = vec3.create();

	monke: Model;

	constructor(gl: WebGL2RenderingContext) {
		this.shaders = loadShaders(gl);
		this.camera = new Camera(gl);
		this.lighting = new Lighting(gl, this.camera, this.shaders);
		loadTextures(gl)
			.then((_) => {
				this.texturesLoaded = true;
			})
			.catch((err) => {
				console.error(err);
			});

		this.camera.position[2] = 5.0;

		this.monke = new Model(gl, "/monke-smooth.bobj", textures.monke, this.shaders.diffuse);
		this.monke.roughness = 0.0;
		this.monke.metallic = 1.0;
		this.add(this.monke);
		// const landscape = new Model(gl, "/landscape.bobj", this.shaders.diffuse);
		// landscape.roughness = 1.0;
		// this.add(landscape);
		// const sphere = new Model(gl, "/sphere.bobj", this.shaders.diffuse);
		// sphere.roughness = 0.05;
		// sphere.metallic = 1.0;
		// this.add(sphere);

		gl.enable(gl.CULL_FACE);

		// create global ubo
		this.ubo = gl.createBuffer();
		gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
		gl.bufferData(gl.UNIFORM_BUFFER, 240, gl.DYNAMIC_DRAW);
		gl.bindBufferRange(gl.UNIFORM_BUFFER, 0, this.ubo, 0, 240);
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);

		// update the lighting range of the ubo
		this.lighting.updateUBO(gl, this.ubo);
	}

	public add(obj: SceneObject) {
		this.objects.push(obj);
	}

	public remove(obj: SceneObject) {
		this.objects.splice(this.objects.indexOf(obj), 1);
	}

	public draw(gl: WebGL2RenderingContext, inputManager: Input, deltaTime: number) {
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

		vec3.set(
			this.vel,
			Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[0] + (this.accel[0] - this.vel[0]) * ACCEL * deltaTime)),
			Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[1] + (this.accel[1] - this.vel[1]) * ACCEL * deltaTime)),
			Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[2] + (this.accel[2] - this.vel[2]) * ACCEL * deltaTime)),
		);

		vec3.scaleAndAdd(this.camera.position, this.camera.position, this.vel, 0.01 * deltaTime);

		// clear everything
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clearDepth(1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// update camera
		this.camera.update(gl);

		// update global ubo
		this.cameraUboBuffer.set(this.camera.position);
		this.cameraUboBuffer.set(this.camera.viewProjMatrix, 4);
		gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.cameraUboBuffer);
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);

		if (!this.lighting.loaded || !this.texturesLoaded) {
			return;
		}

		this.monke.transform.position[1] = Math.sin(performance.now() / 200) * 0.1 + 1.0;
		this.monke.transform.rotation[0] = performance.now() / 100;
		this.monke.transform.rotation[1] = performance.now() / 100;
		this.monke.transform.rotation[2] = performance.now() / 100;
		this.monke.transform.update(gl);

		// draw objects
		for (const obj of this.objects.values()) {
			obj.draw && obj.draw(gl, this, this.camera);
		}

		// draw skybox
		gl.depthFunc(gl.LEQUAL);
		this.lighting.draw(gl);
		gl.depthFunc(gl.LESS);
	}
}
