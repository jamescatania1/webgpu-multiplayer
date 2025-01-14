# WaveFront (.obj) to Binary WaveFront (.bobj) converter
Similar to .obj file but encoded in my own shitty binary format.

### Notes
This is not standard MOD, and doesn't work with the obj spec.
- The input file must only include triangles.
- The input file cannot include mixed comments and lines, nor split lines with the continuation character (\).
- All points, lines, matrials are ignored.

### Output .bobj format
- All values are encoded in little endian, with floats in standard IEEE 754.
- All of the following properties will necessarily be in the file. There are no comments or other keywords.

#### Header
- 1 byte: Size of the index elements, in bytes (either 1, 2, or 4 unsigned)
- 4 bytes: Number of vertices (uint32)
- 4 bytes: Number of texture coordinates (uint32)
- 4 bytes: Number of normals (uint32)
- 4 bytes: Number of vertex indices (uint32)
- 4 bytes: Number of texture indices (uint32)
- 4 bytes: Number of normal indices (uint32)

### Data
- (# vertices * 4) bytes: Vertices (x/float32, y/float32, z/float32)
- (# texture vertices * 4) bytes: Texture coordinates (float32 each u/float32, v/float32)
- (# normals * 4) bytes: Vertex normals (dx/float32, dy/float32, dz/float32)
- (# vertex indices * index size) bytes: Vertex indices (v1, v2, v3)
- (# texture indices * index size) bytes: Texture indices (t1, t2, t3)
- (# normal indices * index size) bytes: Normal indices (n1, n2, n3)


## Usage
```bash
./bin-obj <input.obj> <output.bin.obj>
```