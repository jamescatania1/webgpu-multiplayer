import { default as basicShaderSource } from "./shaders/basic.wgsl";
import { default as PBRShaderSource } from "./shaders/pbr.wgsl";
import { default as depthShaderSource } from "./shaders/depth.wgsl";
import { default as postFXShaderSource } from "./shaders/post_fx.wgsl";
import { ssaoSettings } from "./Renderer";

export type Shaders = {
	basic: GPUShaderModule;
	PBR: GPUShaderModule;
	depth: GPUShaderModule;
	postFX: GPUShaderModule;
};

type ShaderLoaderDescriptor = {
	code: string;
	label?: string;
	templates?: { [key: string]: string };
};

export function loadShaders(device: GPUDevice): Shaders {
	const basic = loadShader(device, {
		label: "cube shader",
		code: basicShaderSource,
	});

	const PBR = loadShader(device, {
		label: "pbr shader",
		code: PBRShaderSource,
		templates: {
			"ssao_samples": Math.round(ssaoSettings.sampleCount).toString(),
		},
	});

	const depth = loadShader(device, {
		label: "depth prepass shader",
		code: depthShaderSource,
	});
	const postFX = loadShader(device, {
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

function loadShader(device: GPUDevice, descriptor: ShaderLoaderDescriptor): GPUShaderModule {
	let code = descriptor.code;
	if (descriptor.templates) {
		for (const [key, value] of Object.entries(descriptor.templates)) {
			code = code.replaceAll(`TEMPL_${key}`, value);
		}
	}
	return device.createShaderModule({
		label: descriptor.label,
		code: code,
	});
}
