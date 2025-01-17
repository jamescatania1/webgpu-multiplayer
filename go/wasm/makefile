OS := $(OS)

build:
ifeq ($(OS),Windows_NT)
	powershell.exe -File ./build.ps1
else
	GOOS=js GOARCH=wasm tinygo build -o ../../frontend/src/game/wasm/main.wasm
endif