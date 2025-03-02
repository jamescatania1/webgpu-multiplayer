import { loadBOBJ, type ModelData } from "./Model";
import type { HDRData } from "./utils/hdr";
import loadHDR from "./utils/hdr";

export type ResourceAtlas = {
	cube: ModelData;
	monke: ModelData;
	scene: ModelData;
	city: ModelData;
	sky: HDRData;
	noise: GPUTexture;
};

const resourceDescriptors = {
	models: {
		cube: "/cube.bobj",
		monke: "/monke.bobj",
		city: "/city.bobj",
		scene: "/scene.bobj",
	},
	hdrs: {
		sky: {
			url: "/sky.hdr",
			minComponent: 100.0,
		},
	},
	images: {
		noise: {
			url: "/noise.bmp",
		}
	}
};

export const loadResources = async (device: GPUDevice): Promise<ResourceAtlas> => {
	const modelPromises = Object.entries(resourceDescriptors.models).map(async ([key, url]) => {
		const model = await loadBOBJ(device, url);
		const res: any = {};
		res[key] = model;
		return res;
	});
	const hdrPromises = Object.entries(resourceDescriptors.hdrs).map(async ([key, desc]) => {
		const hdr = await loadHDR(desc.url, desc.minComponent);
		const res: any = {};
		res[key] = hdr;
		return res;
	});
	const imagePromises = Object.entries(resourceDescriptors.images).map(async ([key, desc]) => {
		const data = await fetch(desc.url);
		const blob = await data.blob();
		const bitmap = await createImageBitmap(blob);
		const image = await device.createTexture({
			label: "blue noise texture",
			size: [bitmap.width, bitmap.height, 1],
			format: "r16float",
			usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});
		device.queue.copyExternalImageToTexture({ source: bitmap, }, { texture: image }, [bitmap.width, bitmap.height, 1]);
		const res: any = {};
		res[key] = image;
		return res;
	});

	const resources = await Promise.all([...modelPromises, ...hdrPromises, ...imagePromises]);
	const atlas: any = {};
	for (const resource of resources) {
		for (const [key, data] of Object.entries(resource)) {
			atlas[key] = data;
		}
	}
	return atlas as ResourceAtlas;
};
