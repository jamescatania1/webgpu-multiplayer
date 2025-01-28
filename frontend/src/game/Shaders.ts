import {default as cubeShaderSource } from "./shaders/cube.wgsl";

export type Shaders = {
	cube: GPUShaderModule;
};

export function loadShaders(device: GPUDevice): Shaders {
	const cube = device.createShaderModule({
		label: "cube shader",
		code: cubeShaderSource,
	});

	return {
		cube: cube,
	};
}