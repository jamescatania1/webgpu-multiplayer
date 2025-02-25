import { loadBOBJ, type ModelData } from "./Model";
import type { HDRData } from "./utils/hdr";
import loadHDR from "./utils/hdr";

export type ResourceAtlas = {
	cube: ModelData;
	monke: ModelData;
	scene: ModelData;
	city: ModelData;
	sky: HDRData;
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
	const resources = await Promise.all([...modelPromises, ...hdrPromises]);
	const atlas: any = {};
	for (const resource of resources) {
		for (const [key, data] of Object.entries(resource)) {
			atlas[key] = data;
		}
	}
	return atlas as ResourceAtlas;
};
