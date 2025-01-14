// export interface ButtonState {
// 	clicked: boolean;
// 	released: boolean;
// 	down: boolean;
// }

export default class Input {
	private readonly inputKeys: {
		[key: string]: {
			pressed: boolean;
			released: boolean;
			down: boolean;
		};
	} = {};
	public readonly prevMouseX: number = 0;
	public readonly prevMouseY: number = 0;
	public readonly mouseX: number = 0;
	public readonly mouseY: number = 0;
	public pointerLocked: boolean;
	public dx: number = 0;
	public dy: number = 0;
	public readonly mouseLeft = {
		clicked: false,
		released: false,
		down: false,
	};
	public readonly mouseRight = {
		clicked: false,
		released: false,
		down: false,
	};
	private canvas: HTMLCanvasElement;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.pointerLocked = document.pointerLockElement === canvas;
		window.addEventListener("keydown", this.onKeyDown);
		window.addEventListener("keyup", this.onKeyUp);
		window.addEventListener("blur", this.onBlur);
		canvas.addEventListener("mousedown", this.onMouseDown);
		canvas.addEventListener("mouseup", this.onMouseUp);
		canvas.addEventListener("mousemove", this.onMouseMove);
		canvas.addEventListener("click", this.onClick);
	}

	onDestroy() {
		window.removeEventListener("keydown", this.onKeyDown);
		window.removeEventListener("keyup", this.onKeyUp);
		window.removeEventListener("blur", this.onBlur);
		this.canvas.removeEventListener("mousedown", this.onMouseDown);
		this.canvas.removeEventListener("mouseup", this.onMouseUp);
		this.canvas.removeEventListener("mousemove", this.onMouseMove);
		this.canvas.removeEventListener("click", this.onClick);
	}

	/**
	 * Called at the end of each frame
	 */
	public update() {
		this.mouseLeft.clicked = this.mouseLeft.released = false;
		this.mouseRight.clicked = this.mouseRight.released = false;

		this.pointerLocked = document.pointerLockElement === this.canvas;
		this.dx = 0;
		this.dy = 0;

		for (const key of Object.values(this.inputKeys)) {
			key.pressed = key.released = false;
		}
	}

	/**
	 * @param key key code
	 * @returns whether the key is being held down
	 */
	public keyDown = (key: string): boolean => {
		return this.inputKeys[key]?.down || false;
	};

	/**
	 * @param key key code
	 * @returns whether the key was just pressed down, i.e., a keydown event occurred
	 */
	public keyPressed = (key: string): boolean => {
		return this.inputKeys[key]?.pressed || false;
	};

	/**
	 *
	 * @param key key code
	 * @returns whether the key was just released, i.e., a keyup event occurred
	 */
	public keyReleased = (key: string): boolean => {
		return this.inputKeys[key]?.released || false;
	};

	private onKeyDown = (e: KeyboardEvent) => {
		if (!this.inputKeys[e.key]) {
			this.inputKeys[e.key] = { down: true, pressed: true, released: false };
		}
		if (!this.inputKeys[e.key].down) {
			this.inputKeys[e.key].pressed = true;
			this.inputKeys[e.key].down = true;
		}
	};

	private onKeyUp = (e: KeyboardEvent) => {
		if (!this.inputKeys[e.key]) {
			this.inputKeys[e.key] = { down: false, pressed: false, released: true };
		}
		this.inputKeys[e.key].down = false;
		this.inputKeys[e.key].released = true;
	};

	private onClick = async (e: MouseEvent) => {
		if (!document.pointerLockElement) {
			try {
				await this.canvas.requestPointerLock({
					unadjustedMovement: true,
				});
			} catch (_) {}
		}
	};

	private onMouseDown = (e: MouseEvent) => {
		if (e.button === 0) {
			this.mouseLeft.clicked = true;
			this.mouseLeft.down = true;
		} else if (e.button === 2) {
			this.mouseRight.clicked = true;
			this.mouseRight.down = true;
		}
		this.onMouseMove(e);
	};

	private onMouseUp = (e: MouseEvent) => {
		if (e.button === 0) {
			this.mouseLeft.released = true;
			this.mouseLeft.down = false;
		} else if (e.button === 2) {
			this.mouseRight.released = true;
			this.mouseRight.down = false;
		}
		this.onMouseMove(e);
	};

	private onMouseMove = (e: MouseEvent) => {
		const scale = Math.max(this.canvas.clientWidth, this.canvas.clientHeight);
		// this.mouseX = ((e.clientX - rect.left) / (rect.right - rect.left)) * 2.0 - 1.0;
		// this.mouseY = ((e.clientY - rect.top) / (rect.bottom - rect.top)) * 2.0 - 1.0;
		// const
		this.dx += e.movementX / scale;
		this.dy += e.movementY / scale;
	};

	private onBlur = () => {
		for (const key of Object.values(this.inputKeys)) {
			key.down = false;
			key.released = true;
		}
	};
}
