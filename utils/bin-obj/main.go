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

var debug = false

type LineType string

var face LineType = "f"
var vertex LineType = "v"

func readLine(scanner *bufio.Scanner) (LineType, []string, error) {
	line := strings.TrimSpace(scanner.Text())
	if len(line) == 0 || line[0] == '#' {
		return "", nil, errors.New("comment or empty")
	}
	vals := strings.Fields(line)
	key := LineType(vals[0])
	if key == vertex || key == face {
		return key, vals[1:], nil
	}
	return "", nil, errors.New("unexpected/unsupported prefix: " + vals[0])
}

func writeIndices[I any](output *os.File, indices []uint32, indexConv func(uint32) I) {
	for i := 0; i < len(indices); i++ {
		binary.Write(output, binary.LittleEndian, indexConv(indices[i]-1))
	}
}

func main() {
	in := flag.String("input", "", "Input file path")
	out := flag.String("output", "", "Output file path")
	flag.BoolVar(&debug, "verbose", false, "Log stats")

	flag.Parse()

	if *in == "" || *out == "" {
		fmt.Println("Invalid arguments. Please provide an input and output file.")
		fmt.Println("Usage: --input <./path/to/input.obj> --output <./path/to/output.bin.obj> [--verbose]")
		os.Exit(1)
	}

	input, err := os.Open(*in)
	if err != nil {
		fmt.Printf("Error opening input file: %v\n", err)
		os.Exit(1)
	}
	defer input.Close()

	output, err := os.Create(*out)
	if err != nil {
		fmt.Printf("Error creating output file: %v\n", err)
		os.Exit(1)
	}
	defer output.Close()

	// Read input file
	scanner := bufio.NewScanner(input)
	vertices := make([]float32, 0)
	colors := make([]float32, 0)
	indices := make([]uint32, 0)
	var maxIndex uint32 = 0
	maxVertex := 0.0
	for scanner.Scan() {
		key, vals, err := readLine(scanner)
		if err != nil {
			continue
		}
		switch key {
		case vertex:
			if len(vals) != 3 && len(vals) != 6 {
				fmt.Println("Error: vertex must have 3 or 6 values.")
				os.Exit(1)
			}
			for _, val := range vals[:3] {
				if w, err := strconv.ParseFloat(val, 32); err == nil {
					vertices = append(vertices, float32(w))
					maxVertex = max(maxVertex, math.Abs(w))
				} else {
					fmt.Printf("Error parsing vertex: %v\n", err)
					os.Exit(1)
				}
			}
			if len(vals) == 6 {
				for _, val := range vals[3:6] {
					if q, err := strconv.ParseFloat(val, 32); err == nil {
						colors = append(colors, float32(q))
					} else {
						fmt.Printf("Error parsing vertex color: %v\n", err)
						os.Exit(1)
					}
				}
			}
		case face:
			if len(vals) != 3 {
				fmt.Println("Error: face must have 3 values.")
				os.Exit(1)
			}
			for _, val := range vals {
				if strings.Contains(val, "/") {
					fmt.Println("Error: face contains texture or normal indices. Only vertex indices are supported.")
					os.Exit(1)
				}
				if i, err := strconv.ParseUint(val, 10, 32); err == nil {
					maxIndex = max(maxIndex, uint32(i))
					indices = append(indices, uint32(i))
				} else {
					fmt.Printf("Error parsing face index: %v\n", err)
					os.Exit(1)
				}
			}
		}
	}

	// Compute normals
	normals := make([]float32, len(vertices))
	connectedTriCount := make([]int, len(vertices)/3)
	for i := 0; i < len(indices); i += 3 {
		i1 := indices[i] - 1
		i2 := indices[i+1] - 1
		i3 := indices[i+2] - 1
		v1 := vertices[i1*3 : i1*3+3]
		v2 := vertices[i2*3 : i2*3+3]
		v3 := vertices[i3*3 : i3*3+3]
		n := cross(subtract(v2, v1), subtract(v3, v1))
		normalize(n)
		connectedTriCount[i1]++
		connectedTriCount[i2]++
		connectedTriCount[i3]++
		var j uint32
		for j = 0; j < 3; j++ {
			normals[i1*3+j] += n[j]
			normals[i2*3+j] += n[j]
			normals[i3*3+j] += n[j]
		}
	}
	for i := 0; i < len(normals); i++ {
		normals[i] /= float32(connectedTriCount[i/3])
	}

	var indexBytes uint8
	if maxIndex > math.MaxUint16 { // encode as 32-bit indices
		indexBytes = 4
	} else if maxIndex > math.MaxUint8 { // encode as 16-bit indices
		indexBytes = 2
	} else { // encode as 8-bit indices
		indexBytes = 1
	}

	scaleFactor := 1.0
	if maxVertex > 0.5 {
		scaleFactor = 0.5 / maxVertex
	}

	hasColor := len(vertices) == len(colors)
	if !hasColor && len(colors) > 0 {
		fmt.Println("Error: colors are present but not all vertices have a color.")
		os.Exit(1)
	}
	if len(vertices)%3 != 0 {
		fmt.Println("Error: vertices must be in groups of 3.")
		os.Exit(1)
	}

	// Write output file
	binary.Write(output, binary.LittleEndian, indexBytes)
	if hasColor {
		binary.Write(output, binary.LittleEndian, uint8(1))
	} else {
		binary.Write(output, binary.LittleEndian, uint8(0))
	}
	binary.Write(output, binary.LittleEndian, scaleFactor)
	binary.Write(output, binary.LittleEndian, uint32(len(vertices))) // 3 * 32-bit packed per vertex
	binary.Write(output, binary.LittleEndian, uint32(len(indices)))
	for i := 0; i < len(vertices); i += 3 {
		x := uint16((float64(vertices[i])*scaleFactor + 0.5) * float64(math.MaxUint16))
		y := uint16((float64(vertices[i+1])*scaleFactor + 0.5) * float64(math.MaxUint16))
		z := uint16((float64(vertices[i+2])*scaleFactor + 0.5) * float64(math.MaxUint16))
		var c uint16 = 0
		if hasColor { // colors are present, pack as rgb-5_6_5
			c = uint16(colors[i]*31)<<11 | uint16(colors[i+1]*63)<<5 | uint16(colors[i+2]*31)
		}
		binary.Write(output, binary.LittleEndian, uint32(x)<<16|uint32(y))
		binary.Write(output, binary.LittleEndian, uint32(z)<<16|uint32(c))
		nx := uint32((normals[i] + 1.0) * 0.5 * 1023.0)
		ny := uint32((normals[i+1] + 1.0) * 0.5 * 1023.0)
		nz := uint32((normals[i+2] + 1.0) * 0.5 * 1023.0)
		binary.Write(output, binary.LittleEndian, nx<<22|ny<<12|nz<<2) // pack normals as xyz-10_10_10
	}
	switch indexBytes {
	case 1:
		writeIndices(output, indices, func(i uint32) uint8 { return uint8(i) })
	case 2:
		writeIndices(output, indices, func(i uint32) uint16 { return uint16(i) })
	case 4:
		writeIndices(output, indices, func(i uint32) uint32 { return i })
	}

	path, err := filepath.Abs(*out)
	if err != nil {
		fmt.Printf("Error getting path of output file: %v\n", err)
		os.Exit(1)
	}

	if debug {
		log.Println("vertex count: ", len(vertices))
		log.Println("index count: ", len(indices))
		log.Println("index byte size: ", indexBytes)
		log.Println("max index: ", maxIndex)
	}

	fmt.Printf("Wrote to %s\n", path)
}

func cross(v1 []float32, v2 []float32) []float32 {
	return []float32{
		v1[1]*v2[2] - v1[2]*v2[1],
		v1[2]*v2[0] - v1[0]*v2[2],
		v1[0]*v2[1] - v1[1]*v2[0],
	}
}

func subtract(v1 []float32, v2 []float32) []float32 {
	return []float32{v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]}
}

func normalize(v []float32) {
	len := math.Sqrt(float64(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]))
	v[0] = float32(float64(v[0]) / len)
	v[1] = float32(float64(v[1]) / len)
	v[2] = float32(float64(v[2]) / len)
}
