package main

import (
	"bufio"
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Triangle struct {
	flat      bool
	hasNormal bool
	hasUV     bool
	vertices  [3]uint32
	uvs       [3]uint32
	normals   [3]uint32
}

type LineType string

const (
	tri    LineType = "f"
	vertex LineType = "v"
	uv     LineType = "vt"
	normal LineType = "vn"
	shade  LineType = "s"
)

var debug bool = false

func readLine(scanner *bufio.Scanner) (LineType, []string, error) {
	line := strings.TrimSpace(scanner.Text())
	if len(line) == 0 || line[0] == '#' {
		return "", nil, errors.New("comment or empty")
	}
	vals := strings.Fields(line)
	key := LineType(vals[0])
	if key == vertex || key == tri || key == shade || key == uv || key == normal {
		return key, vals[1:], nil
	}
	return "", nil, errors.New("unexpected/unsupported prefix: " + vals[0])
}

func writeIndices[I any](output *os.File, indices []uint32, indexConv func(uint32) I) {
	for i := 0; i < len(indices); i++ {
		binary.Write(output, binary.LittleEndian, indexConv(indices[i]))
	}
}

func main() {
	flag.BoolVar(&debug, "verbose", false, "Log stats")

	flag.Usage = func() {
		fmt.Println("Invalid arguments provided.")
		fmt.Println("Usage: bin-obj <./path/to/input.obj> [<./path/to/output.bin.obj>] [--verbose | --v]")
	}
	flag.Parse()

	if flag.NArg() == 0 {
		flag.Usage()
		os.Exit(1)
	}
	in := flag.Arg(0)
	out := in[0:len(in)-len(filepath.Ext(in))] + ".bobj"
	if flag.NArg() > 1 && flag.Arg(1) != "--verbose" && flag.Arg(1) != "--v" {
		out = flag.Arg(1)
	}
	debug = debug || os.Args[len(os.Args)-1] == "--verbose" || os.Args[len(os.Args)-1] == "--v"

	input, err := os.Open(in)
	if err != nil {
		fmt.Printf("Error opening input file: %v\n", err)
		os.Exit(1)
	}
	defer input.Close()

	output, err := os.Create(out)
	if err != nil {
		fmt.Printf("Error creating output file: %v\n", err)
		os.Exit(1)
	}
	defer output.Close()

	// Read input file
	scanner := bufio.NewScanner(input)

	vertexMinBounds := []float32{math.MaxFloat32, math.MaxFloat32, math.MaxFloat32}
	vertexMaxBounds := []float32{-math.MaxFloat32, -math.MaxFloat32, -math.MaxFloat32}
	vertices := make([]float32, 0)
	colors := make([]float32, 0)
	normals := make([]float32, 0)
	uvs := make([]float32, 0)
	triangles := make([]Triangle, 0)
	shadeFlat := false
	hasColor := false
	hasUV := false
	hasNormal := false
	for scanner.Scan() {
		key, vals, err := readLine(scanner)
		if err != nil {
			continue
		}
		switch key {
		case shade:
			if len(vals) != 1 || vals[0] != "0" && vals[0] != "1" {
				fmt.Println("Error: shade group must be 0 or 1.")
				os.Exit(1)
			}
			shadeFlat = vals[0] == "0"
		case vertex:
			if len(vals) != 3 && len(vals) != 6 {
				fmt.Println("Error: vertex must have 3 or 6 values.")
				os.Exit(1)
			}
			for i, val := range vals[:3] {
				if w, err := strconv.ParseFloat(val, 32); err == nil {
					vertices = append(vertices, float32(w))
					vertexMinBounds[i] = min(vertexMinBounds[i], float32(w))
					vertexMaxBounds[i] = max(vertexMaxBounds[i], float32(w))
				} else {
					fmt.Printf("Error parsing vertex: %v\n", err)
					os.Exit(1)
				}
			}
			if len(vals) == 6 {
				if !hasColor && len(colors) > 0 {
					fmt.Println("Error: colors are present but not all vertices have a color.")
					os.Exit(1)
				}
				hasColor = true
				for _, val := range vals[3:6] {
					if q, err := strconv.ParseFloat(val, 32); err == nil {
						colors = append(colors, float32(q))
					} else {
						fmt.Printf("Error parsing vertex color: %v\n", err)
						os.Exit(1)
					}
				}
			} else if hasColor {
				fmt.Println("Error: colors are present but not all vertices have a color.")
				os.Exit(1)
			}
		case uv:
			hasUV = true
			if len(vals) != 2 {
				fmt.Println("Error: uv must have 2 values.")
				os.Exit(1)
			}
			for _, val := range vals {
				if x, err := strconv.ParseFloat(val, 32); err == nil {
					uvs = append(uvs, float32(x))
				} else {
					fmt.Printf("Error parsing uv: %v\n", err)
					os.Exit(1)
				}
			}
		case normal:
			hasNormal = true
			if len(vals) != 3 {
				fmt.Println("Error: normal must have 3 values.")
				os.Exit(1)
			}
			for _, val := range vals {
				if y, err := strconv.ParseFloat(val, 32); err == nil {
					normals = append(normals, float32(y))
				} else {
					fmt.Printf("Error parsing normal: %v\n", err)
					os.Exit(1)
				}
			}
		case tri:
			if len(vals) != 3 {
				fmt.Println("Error: faces must have 3 vertices.")
				os.Exit(1)
			}
			slashCount := strings.Count(vals[0], "/")
			tri := Triangle{
				flat:      shadeFlat,
				hasNormal: slashCount == 2,
				hasUV:     slashCount >= 1 && !strings.Contains(vals[0], "//"),
				vertices:  [3]uint32{0, 0, 0},
				uvs:       [3]uint32{0, 0, 0},
				normals:   [3]uint32{0, 0, 0},
			}
			if tri.hasNormal && !hasNormal {
				fmt.Println("Error: some faces are missing normals.")
				os.Exit(1)
			}
			if tri.hasUV && !hasUV {
				fmt.Println("Error: some faces are missing uvs.")
				os.Exit(1)
			}
			for i, val := range vals {
				nums := strings.Fields(strings.ReplaceAll(val, "/", " "))
				if v, err := strconv.ParseUint(nums[0], 10, 32); err == nil {
					tri.vertices[i] = uint32(v - 1)
				} else {
					fmt.Printf("Error parsing vertex index: %v\n", err)
					os.Exit(1)
				}
				if tri.hasUV {
					if v, err := strconv.ParseUint(nums[1], 10, 32); err == nil {
						tri.uvs[i] = uint32(v - 1)
					} else {
						fmt.Printf("Error parsing uv index: %v\n", err)
						os.Exit(1)
					}
				} else if tri.hasNormal {
					if v, err := strconv.ParseUint(nums[1], 10, 32); err == nil {
						tri.normals[i] = uint32(v - 1)
					} else {
						fmt.Printf("Error parsing normal index: %v\n", err)
						os.Exit(1)
					}
				}
				if tri.hasUV && tri.hasNormal {
					if v, err := strconv.ParseUint(nums[2], 10, 32); err == nil {
						tri.normals[i] = uint32(v - 1)
					} else {
						fmt.Printf("Error parsing normal index: %v\n", err)
						os.Exit(1)
					}
				}
			}
			triangles = append(triangles, tri)
		}
	}

	vertexLen := 3
	if hasColor {
		vertexLen += 3
	}
	if hasNormal {
		vertexLen += 3
	}
	if hasUV {
		vertexLen += 2
	}

	vertexBuffer := make([]float32, 0)
	vertexBufferMap := make(map[uint32]uint32) // maps the obj's vertex index to the index in the vertex buffer
	indices := make([]uint32, 0)
	var index uint32 = 0
	var maxIndex uint32 = 0

	// Add the smooth shaded triangles to the final buffer.
	// We're assuming that smooth shaded triangles' vertices share the same normal and uv
	for _, tri := range triangles {
		if tri.flat {
			continue
		}
		for i := 0; i < 3; i++ {
			vertexIndex := tri.vertices[i]
			if index, ok := vertexBufferMap[vertexIndex]; ok {
				indices = append(indices, index)
				maxIndex = max(maxIndex, index)
				index += 1
				continue
			}
			indices = append(indices, index)
			maxIndex = max(maxIndex, index)
			vertexBufferMap[vertexIndex] = index
			vertexBuffer = append(vertexBuffer, vertices[vertexIndex*3:vertexIndex*3+3]...)
			if hasColor {
				vertexBuffer = append(vertexBuffer, colors[vertexIndex*3:vertexIndex*3+3]...)
			}
			if hasNormal {
				vertexBuffer = append(vertexBuffer, normals[tri.normals[i]*3:tri.normals[i]*3+3]...)
			}
			if hasUV {
				vertexBuffer = append(vertexBuffer, uvs[tri.uvs[i]*2:tri.uvs[i]*2+2]...)
			}
			index += 1
		}
	}
	// Add the flat shaded triangles to the final buffer.
	// Each flat triangle needs its own vertex to keep the flat shading.
	for _, tri := range triangles {
		if !tri.flat {
			continue
		}
		for i := 0; i < 3; i++ {
			vertexIndex := tri.vertices[i]
			index := uint32(len(vertexBuffer) / vertexLen)
			indices = append(indices, index)
			maxIndex = max(maxIndex, index)
			vertexBuffer = append(vertexBuffer, vertices[vertexIndex*3:vertexIndex*3+3]...)
			if hasColor {
				vertexBuffer = append(vertexBuffer, colors[vertexIndex*3:vertexIndex*3+3]...)
			}
			if hasNormal {
				vertexBuffer = append(vertexBuffer, normals[tri.normals[i]*3:tri.normals[i]*3+3]...)
			}
			if hasUV {
				vertexBuffer = append(vertexBuffer, uvs[tri.uvs[i]*2:tri.uvs[i]*2+2]...)
			}
		}
	}

	var indexBytes uint8
	if maxIndex > 0 { // encode as 32-bit indices
		indexBytes = 4
	} else if maxIndex > math.MaxUint8 { // encode as 16-bit indices
		indexBytes = 2
	} else { // encode as 8-bit indices
		indexBytes = 1
	}

	// Calculate scaling factor and offset from bounds
	scaleFactor := []float64{0.0001, 0.0001, 0.0001}
	for i := 0; i < 3; i++ {
		scaleFactor[i] = 1.0 / float64(vertexMaxBounds[i]-vertexMinBounds[i])
	}
	center := make([]float32, 3)
	for i := 0; i < 3; i++ {
		center[i] = (vertexMaxBounds[i] + vertexMinBounds[i]) / 2.0
	}

	componentMask := uint8(0)
	vertexPackedLen := 2
	if hasColor {
		componentMask |= 4
	}
	if hasNormal {
		componentMask |= 2
		vertexPackedLen += 1
	}
	if hasUV {
		componentMask |= 1
		vertexPackedLen += 1
	}

	// Write output file
	binary.Write(output, binary.LittleEndian, indexBytes)
	binary.Write(output, binary.LittleEndian, componentMask)
	binary.Write(output, binary.LittleEndian, scaleFactor)
	binary.Write(output, binary.LittleEndian, center)
	binary.Write(output, binary.LittleEndian, uint32(len(vertexBuffer)*vertexPackedLen/vertexLen))
	binary.Write(output, binary.LittleEndian, uint32(len(indices)))
	for i := 0; i < len(vertexBuffer); i += vertexLen {
		x := uint16((float64(vertexBuffer[i]-center[0])*scaleFactor[0] + 0.5) * float64(math.MaxUint16))
		y := uint16((float64(vertexBuffer[i+1]-center[1])*scaleFactor[1] + 0.5) * float64(math.MaxUint16))
		binary.Write(output, binary.LittleEndian, uint32(x)<<16|uint32(y))
		z := uint16((float64(vertexBuffer[i+2]-center[2])*scaleFactor[2] + 0.5) * float64(math.MaxUint16))
		c := uint16(math.MaxUint16)
		run := i + 3
		if hasColor { // colors are present, pack as rgb-5_6_5
			c = uint16(vertexBuffer[run]*31)<<11 | uint16(vertexBuffer[run+1]*63)<<5 | uint16(vertexBuffer[run+2]*31)
			run += 3
		}
		binary.Write(output, binary.LittleEndian, uint32(z)<<16|uint32(c))
		if hasNormal { // normals are present, pack as xyz-10_10_10
			nx := uint32((vertexBuffer[run] + 1.0) * 0.5 * 1023.0)
			ny := uint32((vertexBuffer[run+1] + 1.0) * 0.5 * 1023.0)
			nz := uint32((vertexBuffer[run+2] + 1.0) * 0.5 * 1023.0)
			binary.Write(output, binary.LittleEndian, nx<<22|ny<<12|nz<<2)
			run += 3
		}
		if hasUV { // uvs are present, pack as uv-16_16
			u := uint16(vertexBuffer[run] * 65535.0)
			v := uint16(vertexBuffer[run+1] * 65535.0)
			binary.Write(output, binary.LittleEndian, uint32(u)<<16|uint32(v))
		}
	}
	switch indexBytes {
	case 1:
		writeIndices(output, indices, func(i uint32) uint8 { return uint8(i) })
	case 2:
		writeIndices(output, indices, func(i uint32) uint16 { return uint16(i) })
	case 4:
		writeIndices(output, indices, func(i uint32) uint32 { return i })
	}

	path, err := filepath.Abs(out)
	if err != nil {
		fmt.Printf("Error getting path of output file: %v\n", err)
		os.Exit(1)
	}

	if debug {
		log.Println("has color: ", hasColor)
		log.Println("has uv: ", hasUV)
		log.Println("has normal: ", hasNormal)
		log.Println("vertex count: ", len(vertexBuffer)/vertexLen)
		log.Println("triangle count: ", len(indices)/3)
		log.Println("index byte size: ", indexBytes)
		log.Println("max index: ", maxIndex)
		log.Println("scale factor: ", scaleFactor)
		log.Println("global center: ", center)
	}

	fmt.Printf("Wrote to %s\n", path)
}

// func cross(v1 []float32, v2 []float32) []float32 {
// 	return []float32{
// 		v1[1]*v2[2] - v1[2]*v2[1],
// 		v1[2]*v2[0] - v1[0]*v2[2],
// 		v1[0]*v2[1] - v1[1]*v2[0],
// 	}
// }

// func subtract(v1 []float32, v2 []float32) []float32 {
// 	return []float32{v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]}
// }

// func normalize(v []float32) {
// 	len := math.Sqrt(float64(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]))
// 	v[0] = float32(float64(v[0]) / len)
// 	v[1] = float32(float64(v[1]) / len)
// 	v[2] = float32(float64(v[2]) / len)
// }

// Compute normals
// normals := make([]float32, len(vertices))
// connectedTriCount := make([]int, len(vertices)/3)
// for i := 0; i < len(indices); i += 3 {
// 	i1 := indices[i] - 1
// 	i2 := indices[i+1] - 1
// 	i3 := indices[i+2] - 1
// 	v1 := vertices[i1*3 : i1*3+3]
// 	v2 := vertices[i2*3 : i2*3+3]
// 	v3 := vertices[i3*3 : i3*3+3]
// 	n := cross(subtract(v2, v1), subtract(v3, v1))
// 	normalize(n)
// 	connectedTriCount[i1]++
// 	connectedTriCount[i2]++
// 	connectedTriCount[i3]++
// 	var j uint32
// 	for j = 0; j < 3; j++ {
// 		normals[i1*3+j] += n[j]
// 		normals[i2*3+j] += n[j]
// 		normals[i3*3+j] += n[j]
// 	}
// }
// for i := 0; i < len(normals); i++ {
// 	normals[i] /= float32(connectedTriCount[i/3])
// }
