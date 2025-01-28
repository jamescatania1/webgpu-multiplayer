import { default as basicShaderSource } from "./shaders/basic.wgsl";
import { default as PBRShaderSource } from "./shaders/pbr.wgsl";

export type Shaders = {
	basic: GPUShaderModule;
	PBR: GPUShaderModule;
};

export function loadShaders(device: GPUDevice): Shaders {
	const basic = device.createShaderModule({
		label: "cube shader",
		code: basicShaderSource,
	});
	const PBR = device.createShaderModule({
		label: "pbr shader",
		code: PBRShaderSource,
	});

	return {
		basic: basic,
		PBR: PBR,
	};
}
