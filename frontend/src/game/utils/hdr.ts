export type HDRData = {
	width: number;
	height: number;
	data: Uint16Array;
};

/**
 * Loads a .hdr file from url.
 */
export default function loadHDR(url: string, minComponent: number = 1000.0): Promise<HDRData> {
	return new Promise((resolve, reject) => {
		const startTime = performance.now();
		try {
			fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/octet-stream",
				},
			})
				.then((response) => {
					if (!response.ok) {
						reject("Failed to load: " + url);
					}
					return response.arrayBuffer();
				})
				.then((buffer) => {
					console.log((performance.now() - startTime).toFixed(2), "ms");
					try {
						resolve(read_hdr(new Uint8Array(buffer), minComponent));
					} catch (e: any) {
						reject(e.message);
					}
				})
				.catch((e) => {
					throw new Error(e.message);
				});
		} catch (e: any) {
			reject(e.message);
		}
	});
}

/**
 * Converts float to half float (as uint16)
 */
const toHalf = (function () {
	var floatView = new Float32Array(1);
	var int32View = new Int32Array(floatView.buffer);

	return function toHalf(fval: number, min: number) {
		floatView[0] = Math.min(min, fval);
		var fbits = int32View[0];
		var sign = (fbits >> 16) & 0x8000; // sign only
		var val = (fbits & 0x7fffffff) + 0x1000; // rounded value

		if (val >= 0x47800000) {
			// might be or become NaN/Inf
			if ((fbits & 0x7fffffff) >= 0x47800000) {
				// is or must become NaN/Inf
				if (val < 0x7f800000) {
					// was value but too large
					return sign | 0x7c00; // make it +/-Inf
				}
				return (
					sign |
					0x7c00 | // remains +/-Inf or NaN
					((fbits & 0x007fffff) >> 13)
				); // keep NaN (and Inf) bits
			}
			return sign | 0x7bff; // unrounded not quite Inf
		}
		if (val >= 0x38800000) {
			// remains normalized value
			return sign | ((val - 0x38000000) >> 13); // exp - 127 + 15
		}
		if (val < 0x33000000) {
			// too small for subnormal
			return sign; // becomes +/-0
		}
		val = (fbits & 0x7fffffff) >> 23; // tmp exp for subnormal calc
		return (
			sign |
			((((fbits & 0x7fffff) | 0x800000) + // add subnormal bit
				(0x800000 >>> (val - 102))) >> // round depending on cut off
				(126 - val))
		); // div by 2^(1-(exp-127+15)) and >> 13 | exp=0
	};
})();

function read_hdr(uint8: Uint8Array, minComponent: number): HDRData {
	let header = "";
	let pos = 0;

	// read header
	while (!header.match(/\n\n[^\n]+\n/g) && pos < 10240) {
		header += String.fromCharCode(uint8[pos++]);
	}

	const format = (header.match(/FORMAT=(.*)$/m) || [])[1];
	if (format !== "32-bit_rle_rgbe") {
		throw new Error("Unsupported HDR format: " + format);
	}

	const dimensions: string[] = header.split(/\n/).reverse()[1].split(" ");
	const width = Number.parseFloat(dimensions[3]);
	const height = Number.parseFloat(dimensions[1]);

	let i, j;
	let c1: number = uint8[pos];
	let c2: number = uint8[pos + 1];
	let len: number = uint8[pos + 2];

	const data = new Uint16Array(width * height * 4);
	if (c1 !== 2 || c2 !== 2 || !!(len & 0x80)) {
		// not run-length encoded
		console.log("not rle");
		for (j = 0; j < height; ++j) {
			for (i = 0; i < width; ++i) {
				const rgbe = uint8.subarray(pos, pos + 4);
				pos += 4;
				const start = (j * width + i) * 4;
				// rgbeToRGBA16(rgbe, data.subarray(start, start + 4), minComponent);
			}
		}
	} else {
		let c1: number;
		let c2: number;
		let len: number;
		for (let j = 0; j < height; j++) {
			c1 = uint8[pos++];
			c2 = uint8[pos++];
			len = uint8[pos++];
			if (c1 !== 2 || c2 !== 2 || len & 0x80) {
				throw new Error("Invalid scanline");
			}

			len = len << 8;
			len |= uint8[pos++];
			if (len !== width) {
				throw new Error("Invalid scanline");
			}

			let count: number;
			let value: number;
			for (let k = 0; k < 4; k++) {
				let nLeft: number;
				i = 0;
				while ((nLeft = width - i) > 0) {
					count = uint8[pos++];
					if (count > 128) {
						value = uint8[pos++];
						count -= 128;
						if (count > nLeft) {
							throw new Error("Bad RLE data in HDR");
						}
						for (let z = 0; z < count; z++) {
							// scanline[i++ * 4 + k] = value;
							data[(j * width + i++) * 4 + k] = value;
						}
					} else {
						if (count > nLeft) {
							throw new Error("Bad RLE data in HDR");
						}
						for (let z = 0; z < count; z++) {
							// scanline[i++ * 4 + k] = uint8[pos++];
							data[(j * width + i++) * 4 + k] = uint8[pos++];
						}
					}
				}
			}

			for (let i = 0; i < width; i++) {
				const f1 = Math.pow(2.0, data[(i + j * width) * 4 + 3] - (128 + 8));
				for (let h = 0; h < 3; h++) {
					data[(j * width + i) * 4 + h] = toHalf(data[(j * width + i) * 4 + h] * f1, minComponent);
				}
			}
		}
	}

	return {
		data: data,
		width: width,
		height: height,
	};
}
