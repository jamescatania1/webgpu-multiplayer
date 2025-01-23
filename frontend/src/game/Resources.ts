export type TextureMap = "albedo" | "normal" | "metallic" | "roughness";

export type TextureResource = {
	albedo?: WebGLTexture;
	normal?: WebGLTexture;
	metallic?: WebGLTexture;
	roughness?: WebGLTexture;
};

const textureData = {
	monke: {
		baseURL: "/monke-smooth",
		maps: ["albedo", "normal", "metallic", "roughness"],
		extension: "webp",
	},
    base: {
        baseURL: "/base",
        maps: ["albedo", "normal", "metallic", "roughness"],
        extension: "webp",
    },
    empty: {
        baseURL: "/",
        maps: [],
        extension: "webp",
    }
};

export const textures: { [key: string]: TextureResource } = {
	monke: {},
    base: {},
    empty: {},
};

export const loadTextures = (gl: WebGL2RenderingContext): Promise<void> => {
	return new Promise<void>((resolve, reject) => {
		const promises: Promise<[string, TextureMap, WebGLTexture]>[] = [];
		Object.entries(textureData).forEach(([name, resource]) => {
			for (const map of resource.maps) {
				promises.push(
					new Promise<[string, TextureMap, WebGLTexture]>((resolve, reject) => {
						const texture = gl.createTexture();
						gl.bindTexture(gl.TEXTURE_2D, texture);
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

						const image = new Image();
						image.src = `${resource.baseURL}_${map}.${resource.extension}`;
						image.onload = () => {
							gl.activeTexture(gl.TEXTURE0);
							gl.bindTexture(gl.TEXTURE_2D, texture);
							gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
							switch (map) {
								case "albedo":
									gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
									break;
								case "normal":
									gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
									break;
								case "metallic":
									gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
									break;
								case "roughness":
									gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
									break;
							}
							gl.bindTexture(gl.TEXTURE_2D, null);
							gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
							resolve([name, map as TextureMap, texture]);
						};
						image.onerror = (e) => {
							reject(e);
						};
					}),
				);
			}
		});

		Promise.all(promises)
			.then((res) => {
				for (const [name, map, texture] of res) {
					textures[name][map] = texture;
				}
				resolve();
			})
			.catch((err) => {
				reject(err);
			});
	});
};
