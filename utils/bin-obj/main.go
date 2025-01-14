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
	"strings"
)

var keys = []string{"vt", "vn", "v", "f"}
var debug = false

func readLine(scanner *bufio.Scanner) (string, string, error) {
	line := strings.TrimSpace(scanner.Text())
	if len(line) == 0 || line[0] == '#' {
		return "", "", errors.New("comment or empty")
	}
	for _, key := range keys {
		if strings.HasPrefix(line, key) {
			return key, strings.TrimSpace(strings.TrimPrefix(line, key)), nil
		}
	}
	return "", "", errors.New("unexpected/unsupported prefix")
}

func write[V any, I any](output *os.File, vertices []V, textures []V, normals []V, vertIndices []I, texIndices []I, normIndices []I) {
	binary.Write(output, binary.LittleEndian, uint32(len(vertices)))
	binary.Write(output, binary.LittleEndian, uint32(len(textures)))
	binary.Write(output, binary.LittleEndian, uint32(len(normals)))
	binary.Write(output, binary.LittleEndian, uint32(len(vertIndices)))
	binary.Write(output, binary.LittleEndian, uint32(len(texIndices)))
	binary.Write(output, binary.LittleEndian, uint32(len(normIndices)))
	for i := 0; i < len(vertices); i++ {
		binary.Write(output, binary.LittleEndian, vertices[i])
	}
	for i := 0; i < len(textures); i++ {
		binary.Write(output, binary.LittleEndian, textures[i])
	}
	for i := 0; i < len(normals); i++ {
		binary.Write(output, binary.LittleEndian, normals[i])
	}
	for i := 0; i < len(vertIndices); i++ {
		binary.Write(output, binary.LittleEndian, vertIndices[i])
	}
	for i := 0; i < len(texIndices); i++ {
		binary.Write(output, binary.LittleEndian, texIndices[i])
	}
	for i := 0; i < len(normIndices); i++ {
		binary.Write(output, binary.LittleEndian, normIndices[i])
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

	scanner := bufio.NewScanner(input)
	vertices := make([]float32, 0)
	textures := make([]float32, 0)
	normals := make([]float32, 0)
	vertIndices := make([]uint32, 0)
	texIndices := make([]uint32, 0)
	normIndices := make([]uint32, 0)
	var maxIndex uint32 = 0
	for scanner.Scan() {
		key, vals, err := readLine(scanner)
		if err != nil {
			continue
		}
		switch key {
		case "v": // vertex
			var x, y, z float32
			if _, err := fmt.Sscanf(vals, "%f %f %f", &x, &y, &z); err != nil {
				fmt.Printf("Error parsing vertex: %v\n", err)
				os.Exit(1)
			}
			vertices = append(vertices, x, y, z)
		case "vt": // vertex texture coords
			var u, v float32
			if _, err := fmt.Sscanf(vals, "%f %f", &u, &v); err != nil {
				fmt.Printf("Error parsing vertex texture coordinate: %v\n", err)
				os.Exit(1)
			}
			textures = append(textures, u, v)
		case "vn": // vertex normals
			var dx, dy, dz float32
			if _, err := fmt.Sscanf(vals, "%f %f %f", &dx, &dy, &dz); err != nil {
				fmt.Printf("Error parsing vertex normal: %v\n", err)
				os.Exit(1)
			}
			normals = append(normals, dx, dy, dz)
		case "f": // face
			faceType := 0
			for i := range vals {
				if vals[i] == '/' {
					if faceType == 0 {
						faceType = 1
					} else if faceType == 1 {
						if vals[i-1] == '/' {
							faceType = 2
						} else {
							faceType = 3
						}
						break
					}
				} else if vals[i] == ' ' {
					break
				}
			}
			vals = strings.ReplaceAll(vals, "/", " ")
			switch faceType {
			case 0: // just vertex indices
				var v1, v2, v3 uint32
				if _, err := fmt.Sscanf(vals, "%d %d %d", &v1, &v2, &v3); err != nil {
					fmt.Printf("Error parsing face: %v\n", err)
					os.Exit(1)
				}
				vertIndices = append(vertIndices, v1, v2, v3)
				maxIndex = max(maxIndex, v1, v2, v3)
			case 1: // vertex and texture indices
				var v1, v2, v3, t1, t2, t3 uint32
				if _, err := fmt.Sscanf(vals, "%d %d %d %d %d %d", &v1, &t1, &v2, &t2, &v3, &t3); err != nil {
					fmt.Printf("Error parsing face: %v\n", err)
					os.Exit(1)
				}
				vertIndices = append(vertIndices, v1, v2, v3)
				texIndices = append(texIndices, t1, t2, t3)
				maxIndex = max(maxIndex, v1, v2, v3, t1, t2, t3)
			case 2: // vertex and normal indices
				var v1, v2, v3, n1, n2, n3 uint32
				if _, err := fmt.Sscanf(vals, "%d  %d  %d  %d  %d  %d", &v1, &n1, &v2, &n2, &v3, &n3); err != nil {
					fmt.Printf("Error parsing face: %v\n", err)
					os.Exit(1)
				}
				vertIndices = append(vertIndices, v1, v2, v3)
				normIndices = append(normIndices, n1, n2, n3)
				maxIndex = max(maxIndex, v1, v2, v3, n1, n2, n3)
			case 3: // vertex, texture, normal indices
				var v1, v2, v3, t1, t2, t3, n1, n2, n3 uint32
				if _, err := fmt.Sscanf(vals, "%d %d %d %d %d %d %d %d %d", &v1, &t1, &n1, &v2, &t2, &n2, &v3, &t3, &n3); err != nil {
					fmt.Printf("Error parsing face: %v\n", err)
					os.Exit(1)
				}
				vertIndices = append(vertIndices, v1, v2, v3)
				texIndices = append(texIndices, t1, t2, t3)
				normIndices = append(normIndices, n1, n2, n3)
				maxIndex = max(maxIndex, v1, v2, v3, t1, t2, t3, n1, n2, n3)
			}
		}
	}

	if maxIndex > math.MaxUint16 { // encode as 32-bit indices
		output.Write([]uint8{4})
		write(output, vertices, textures, normals, vertIndices, texIndices, normIndices)
	} else if maxIndex > math.MaxUint8 { // encode as 16-bit indices
		output.Write([]uint8{2})
		vIndices := make([]uint16, len(vertIndices))
		for i, x := range vertIndices {
			vIndices[i] = uint16(x)
		}
		tIndices := make([]uint16, len(texIndices))
		for i, x := range texIndices {
			tIndices[i] = uint16(x)
		}
		nIndices := make([]uint16, len(normIndices))
		for i, x := range normIndices {
			nIndices[i] = uint16(x)
		}
		write(output, vertices, textures, normals, vIndices, tIndices, nIndices)
	} else { // encode as 8-bit indices
		output.Write([]uint8{1})
		vIndices := make([]uint8, len(vertIndices))
		for i, x := range vertIndices {
			vIndices[i] = uint8(x)
		}
		tIndices := make([]uint8, len(texIndices))
		for i, x := range texIndices {
			tIndices[i] = uint8(x)
		}
		nIndices := make([]uint8, len(normIndices))
		for i, x := range normIndices {
			nIndices[i] = uint8(x)
		}
		write(output, vertices, textures, normals, vIndices, tIndices, nIndices)
	}

	path, err := filepath.Abs(*out)
	if err != nil {
		fmt.Printf("Error getting path of output file: %v\n", err)
		os.Exit(1)
	}

	if debug {
		log.Println("vertex count: ", len(vertices))
		log.Println("texture coord count: ", len(textures))
		log.Println("normal count: ", len(normals))
		log.Println("vertex index count: ", len(vertIndices))
		log.Println("texture index count: ", len(texIndices))
		log.Println("normal index count: ", len(normIndices))
	}

	fmt.Printf("Wrote to %s\n", path)
}
