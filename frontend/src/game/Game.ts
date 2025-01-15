import Input from "./Input";
import Scene from "./Scene";
import WasmWorker from "./wasm/WasmWorker?worker";

export default class Game {
	private input: Input;
	private worker: Worker;

	constructor(canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl2");
		if (!gl) {
			throw new Error("Unable to initialize WebGL. Your browser or machine may not support it.");
		}

		const input = new Input(canvas);
		const scene = new Scene(gl);
		this.input = input;

		// main draw loop
		let prevTime = NaN;
		const draw = (time: number) => {
			if (Number.isNaN(prevTime)) {
				prevTime = time;
			}
			const deltaTime = Math.max(0, time - prevTime);
			prevTime = time;

			scene.draw(gl, input, deltaTime);

			input.update();

			requestAnimationFrame(draw);
		};

		requestAnimationFrame(draw);

		// init socket and worker for communication
		const worker = new WasmWorker();

		worker.onmessage = (e) => {
			if (e.data === "socket closed") {
				worker.terminate();
			}
		};

		this.worker = worker;
	}

	public onDestroy() {
		this.input.onDestroy();
		this.worker.terminate();
	}
}
