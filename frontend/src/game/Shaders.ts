import { default as basicShaderSource } from "./shaders/basic.wgsl";
import { default as PBRShaderSource } from "./shaders/pbr.wgsl";
import { default as depthShaderSource } from "./shaders/depth.wgsl";
import { default as shadowShaderSource } from "./shaders/shadows.wgsl";
import { default as skyboxShaderSource } from "./shaders/skybox.wgsl";
import { default as ssaoShaderSource } from "./shaders/ssao.wgsl";
import { default as ssaoBlurShaderSource } from "./shaders/ssao_blur.wgsl";
import { default as ssaoUpscaleShaderSource } from "./shaders/ssao_upscale.wgsl";
import { default as postFXShaderSource } from "./shaders/post_fx.wgsl";
import { default as cubemapGeneratorSource } from "./shaders/cubemap_gen.wgsl";
import { default as irradianceGeneratorSource } from "./shaders/irradiance_gen.wgsl";
import { default as prefilterGeneratorSource } from "./shaders/prefilter_gen.wgsl";
import { default as brdfGeneratorSource } from "./shaders/brdf_gen.wgsl";
import { SHADOW_SETTINGS, SSAO_SETTINGS } from "./Renderer";

export type Shaders = {
	basic: GPUShaderModule;
	PBR: GPUShaderModule;
	depth: GPUShaderModule;
	shadows: GPUShaderModule;
	skybox: GPUShaderModule;
	ssao: GPUShaderModule;
	ssaoBlur: GPUShaderModule;
	ssaoUpscale: GPUShaderModule;
	postFX: GPUShaderModule;
	cubemapGenerator: GPUShaderModule;
	irradianceGenerator: GPUShaderModule;
	prefilterGenerator: GPUShaderModule;
	brdfGenerator: GPUShaderModule;
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
			"ssao_samples": Math.round(SSAO_SETTINGS.sampleCount).toString(),
			"shadow_cascades": Math.round(SHADOW_SETTINGS.cascades.length).toString(),
			"shadow_kernel_size": Math.round(SHADOW_SETTINGS.kernelSize).toString(),
		},
	});
	const depth = loadShader(device, {
		label: "depth prepass shader",
		code: depthShaderSource,
	});
	const shadows = loadShader(device, {
		label: "shadow pass shader",
		code: shadowShaderSource,
		templates: {
			"shadow_cascades": Math.round(SHADOW_SETTINGS.cascades.length).toString(),
		}
	});
	const skybox = loadShader(device, {
		label: "skybox draw shader",
		code: skyboxShaderSource,
	});
	const ssao = loadShader(device, {
		label: "ssao shader",
		code: ssaoShaderSource,
		templates: {
			"ssao_samples": Math.round(SSAO_SETTINGS.sampleCount).toString(),
		},
	});
	const ssaoBlur = loadShader(device, {
		label: "ssao blur shader",
		code: ssaoBlurShaderSource,
	});
	const ssaoUpscale = loadShader(device, {
		label: "ssao upscale shader",
		code: ssaoUpscaleShaderSource,
	});
	const postFX = loadShader(device, {
		label: "post processing shader",
		code: postFXShaderSource,
	});
	const cubemapGenerator = loadShader(device, {
		label: "cubemap generator compute shader",
		code: cubemapGeneratorSource,
	});
	const irradianceGenerator = loadShader(device, {
		label: "irradiance map generator compute shader",
		code: irradianceGeneratorSource,
	})
	const prefilterGenerator = loadShader(device, {
		label: "prefilter map generator compute shader",
		code: prefilterGeneratorSource,
	});
	const brdfGenerator = loadShader(device, {
		label: "BRDF lut generator compute shader",
		code: brdfGeneratorSource,
	});

	return {
		basic: basic,
		PBR: PBR,
		depth: depth,
		shadows: shadows,
		skybox: skybox,
		ssao: ssao,
		ssaoBlur: ssaoBlur,
		ssaoUpscale: ssaoUpscale,
		postFX: postFX,
		cubemapGenerator: cubemapGenerator,
		irradianceGenerator: irradianceGenerator,
		prefilterGenerator: prefilterGenerator,
		brdfGenerator: brdfGenerator,
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
