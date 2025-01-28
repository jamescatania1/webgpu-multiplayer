import Camera from "./Camera";
import { mat4, vec2, vec3, type Vec2, type Vec3 } from "wgpu-matrix";
import type Input from "./Input";
import type { RenderContext } from "./Game";
import { loadShaders, type Shaders } from "./Shaders";

const MAX_VEL = 1.0;
const ACCEL = 0.01;
const MOUSE_SENSITIVITY = 2.0;
const SSAO_KERNEL_SIZE = 32;

export default class Renderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly device: GPUDevice;
    private readonly adapter: GPUAdapter;
    private readonly ctx: GPUCanvasContext;

    private readonly shaders: Shaders;
    private readonly camera: Camera;

    private readonly pipelines: {
        PBR: GPURenderPipeline;
    }

    private readonly uniformBuffers: {
        global: 
    }

    // private objects: SceneObject[] = [];

    private readonly inputVec: Vec2 = vec2.create();
    private readonly accel: Vec3 = vec3.create();
    private readonly vel: Vec3 = vec3.create();
    private readonly accelY: Vec3 = vec3.create();

    constructor(canvas: HTMLCanvasElement, context: RenderContext) {
        this.canvas = canvas;
        this.device = context.device;
        this.adapter = context.adapter;
        this.ctx = context.ctx;

        this.shaders = loadShaders(this.device);

        this.camera = new Camera(canvas);
        this.camera.position[2] = 5.0;

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({
            device: this.device,
            format: presentationFormat,
        });

        const PBR = this.device.createRenderPipeline({
            label: "render pipeline",
            layout: "auto",
            vertex: {
                module: this.shaders.cube,
                entryPoint: "vs",
                buffers: [
                    {
                        arrayStride: 6 * 4,
                        stepMode: "vertex",
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            },
                            {
                                // color
                                shaderLocation: 1,
                                offset: 3 * 4,
                                format: "float32x3",
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: this.shaders.cube,
                entryPoint: "fs",
                targets: [{ format: presentationFormat }],
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "back",
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less-equal",
                format: "depth24plus",
            },
            multisample: {
                count: 4,
            }
        });
        this.pipelines = {
            PBR: PBR,
        };

        const depthTexture = this.device.createTexture({
            size: [canvas.width, canvas.height],
            sampleCount: 4,
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const depthView = depthTexture.createView();

        const outputTexture = this.device.createTexture({
            size: [canvas.width, canvas.height],
            sampleCount: 4,
            format: presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const outputView = outputTexture.createView();

        // global data uniform buffer
        const globalUniformBuffer = this.device.createBuffer({
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const globalUniformBindGroup = this.device.createBindGroup({
            layout: this.pipelines.PBR.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: globalUniformBuffer,
                    },
                },
            ],
        });
        this.uniformBuffers = {
            global: globalUniformBuffer,
        };

        const renderPassDescriptor: GPURenderPassDescriptor = {
            label: "render pass descriptor",
            colorAttachments: [
                {
                    clearValue: [0.0, 0.0, 0.15, 1.0],
                    loadOp: "clear",
                    storeOp: "store",
                    view: outputView,
                    resolveTarget: this.ctx.getCurrentTexture().createView(),
                },
            ],
            depthStencilAttachment: {
                view: depthView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        };
        const screenAttachment = (renderPassDescriptor.colorAttachments as any)[0];
    }

    // public add(obj: SceneObject) {
    //     this.objects.push(obj);
    // }

    // public remove(obj: SceneObject) {
    //     this.objects.splice(this.objects.indexOf(obj), 1);
    // }

    public draw(input: Input, deltaTime: number) {
        // game logic
        {
            // rotate camera with mouse delta
            if (input.pointerLocked) {
                this.camera.yaw += input.dx * MOUSE_SENSITIVITY;
                this.camera.pitch = Math.min(
                    Math.PI / 2,
                    Math.max(-Math.PI / 2, this.camera.pitch - input.dy * MOUSE_SENSITIVITY),
                );
            }

            // update input vector
            this.inputVec[0] = (input.keyDown("D") || input.keyDown("d") ? 1 : 0) -
                    (input.keyDown("A") || input.keyDown("a") ? 1 : 0);
            this.inputVec[1] = 
                (input.keyDown("W") || input.keyDown("w") ? 1 : 0) -
                    (input.keyDown("S") || input.keyDown("s") ? 1 : 0),
            vec2.normalize(this.inputVec, this.inputVec);

            // update acceleration, velocity and position
            vec3.scale(this.camera.right, -this.inputVec[0], this.accel);
            vec3.scale(this.camera.forward, this.inputVec[1], this.accelY);
            vec3.add(this.accel, this.accelY, this.accel);

            this.vel[0] = Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[0] + (this.accel[0] - this.vel[0]) * ACCEL * deltaTime));
            this.vel[1] = Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[1] + (this.accel[1] - this.vel[1]) * ACCEL * deltaTime));
            this.vel[2] = Math.min(MAX_VEL, Math.max(-MAX_VEL, this.vel[2] + (this.accel[2] - this.vel[2]) * ACCEL * deltaTime));

            vec3.addScaled(this.camera.position, this.vel, 0.01 * deltaTime, this.camera.position);

            // this.monke.transform.position[1] = Math.sin(performance.now() / 200) * 0.1 + 1.0;
            // this.monke.transform.rotation[0] = performance.now() / 100;
            // this.monke.transform.rotation[1] = performance.now() / 100;
            // this.monke.transform.rotation[2] = performance.now() / 100;
            // this.monke.transform.update(gl);
        }

        // update camera
        this.camera.update(this.canvas);

        // update global ubo
		const viewMatrix = mat4.identity();
		mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);
		const aspect = this.canvas.width / this.canvas.height;
		const projMatrix = mat4.perspective((80 * Math.PI) / 180, aspect, 0.1, 100);
		const viewProjMatrix = mat4.multiply(projMatrix, viewMatrix);
		this.device.queue.writeBuffer(
			this.uniformBuffers.global,
			0,
			viewProjMatrix.buffer,
			viewProjMatrix.byteOffset,
			viewProjMatrix.byteLength,
		);

        
    }

    public onResize() {

    }

    private addCube() {
        
		// vertex buffer for cube
		// prettier-ignore
		const cubeVertexData = new Float32Array([
			// x, y, z,    r, g, b
			-0.5, -0.5,  0.5,   1.0, 0.0, 0.0,  // front bottom left
			 0.5, -0.5,  0.5,   0.0, 1.0, 0.0,  // front bottom right
			 0.5,  0.5,  0.5,   0.0, 0.0, 1.0,  // front top right
			-0.5,  0.5,  0.5,   1.0, 1.0, 0.0,  // front top left
			-0.5, -0.5, -0.5,   0.0, 1.0, 1.0,  // back bottom left
			 0.5, -0.5, -0.5,   1.0, 0.0, 1.0,  // back bottom right
			 0.5,  0.5, -0.5,   1.0, 1.0, 1.0,  // back top right
			-0.5,  0.5, -0.5,   1.0, 0.0, 0.0,  // back top left
		]);

		const cubeVertexBuffer = device.createBuffer({
			label: "cube vertex buffer",
			size: cubeVertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(cubeVertexBuffer.getMappedRange()).set(cubeVertexData);
		cubeVertexBuffer.unmap();

		// index buffer for cube
		// prettier-ignore
		const cubeIndexData = new Uint16Array([
			// front
			0, 1, 2,  0, 2, 3,
			// right
			1, 5, 6,  1, 6, 2,
			// back
			5, 4, 7,  5, 7, 6,
			// left
			4, 0, 3,  4, 3, 7,
			// top
			3, 2, 6,  3, 6, 7,
			// bottom
			4, 5, 1,  4, 1, 0,
		]);
		const cubeIndexBuffer = device.createBuffer({
			label: "cube index buffer",
			size: cubeIndexData.byteLength,
			usage: GPUBufferUsage.INDEX,
			mappedAtCreation: true,
		});
		new Uint16Array(cubeIndexBuffer.getMappedRange()).set(cubeIndexData);
		cubeIndexBuffer.unmap();

		// uniform buffer for cube
		const cubeUniformBuffer = this.device.createBuffer({
			size: 16 * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		const cubeUniformBindGroup = this.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(1),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: cubeUniformBuffer,
					},
				},
			],
		});
		const cubeModelMatrix = mat4.identity();
    }
}
