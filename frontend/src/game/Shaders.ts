import { default as basicShaderSource } from "./shaders/basic.wgsl";
import { default as PBRShaderSource } from "./shaders/pbr.wgsl";
import { default as depthShaderSource } from "./shaders/depth.wgsl";
import { default as postFXShaderSource } from "./shaders/post_fx.wgsl";

export type Shaders = {
	basic: GPUShaderModule;
	PBR: GPUShaderModule;
	depth: GPUShaderModule;
	postFX: GPUShaderModule;
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
	const depth = device.createShaderModule({
		label: "depth prepass shader",
		code: depthShaderSource,
	});
	const postFX = device.createShaderModule({
		label: "post processing shader",
		code: postFXShaderSource,
	});

	return {
		basic: basic,
		PBR: PBR,
		depth: depth,
		postFX: postFX,
	};
}
