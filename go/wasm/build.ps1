$env:GOOS = "js"
$env:GOARCH = "wasm"
tinygo build -o ../../frontend/src/game/wasm/main.wasm ./main.go
Write-Output "WASM build complete"