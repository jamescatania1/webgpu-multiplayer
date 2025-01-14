$env:GOOS = "js"
$env:GOARCH = "wasm"
go build -o ../../frontend/src/game/wasm/main.wasm
Write-Output "WASM build complete"