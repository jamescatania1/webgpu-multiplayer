# WaveFront (.obj) to Binary WaveFront (.bobj) converter

Similar to .obj file but encoded in my own shitty binary format.

### Notes

This is not standard MOD, and doesn't work with the obj spec.

- The input file must only include triangles.
- The input file can only contain vertex indices. Texture and normal indices cannot be included.
- The input file cannot include mixed comments and lines, nor split lines with the continuation character (\).
- All points, lines, matrials are ignored.

### Output .bobj format

- All values are encoded in little endian, with floats in standard IEEE 754.
- All of the following properties will necessarily be in the file. There are no comments or other keywords.

#### Header

- 1 byte: Size of the index elements, in bytes (either 1, 2, or 4 unsigned)
- 8 bytes: Scale factor for the model (float64) - to rescale the model, scale the vertices by 1 / (scale-factor)
- 4 bytes: Number of vertices (uint32)
- 4 bytes: Number of indices (uint32)

### Data

- (# vertices \* 2) bytes: Vertices (x/uint16, y/uint16, z/uint16)
- (# indices \* index size) bytes: Vertex indices (v1, v2, v3)

## Usage

```bash
./bin-obj <input.obj> <output.bin.obj>
```
