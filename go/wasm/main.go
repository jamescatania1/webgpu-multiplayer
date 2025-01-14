package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"
)

func onSocketOpen(this js.Value, args []js.Value) interface{} {
	fmt.Println("open")
	js.Global().Call("onSocketOpen")
	return nil
}

func onSocketClose(this js.Value, args []js.Value) interface{} {
	js.Global().Call("onSocketClose")
	return nil
}

func onSocketMessage(this js.Value, args []js.Value) interface{} {
	data := args[0].Get("data")
	fmt.Println("received message: ", data)
	return nil
}

var ws js.Value

func SendSocketMessage(data []uint8) {
	// j.Call("send", data)
	ws.Call("send", data)
}

func main() {
	ws = js.Global().Get("WebSocket").New("ws://localhost:8080/ws")
	ws.Call("addEventListener", "open", js.FuncOf(onSocketOpen))
	ws.Call("addEventListener", "close", js.FuncOf(onSocketClose))
	ws.Call("addEventListener", "message", js.FuncOf(onSocketMessage))

	defer func() {
		ws.Call("removeEventListener", "open", js.FuncOf(onSocketOpen))
		ws.Call("removeEventListener", "close", js.FuncOf(onSocketClose))
		ws.Call("removeEventListener", "message", js.FuncOf(onSocketMessage))
	}()

	js.Global().Set("formatJSON", jsonWrapper())
	<-make(chan struct{})
}

// for t := range time.Tick(1 * time.Second) {
// 	fmt.Println("time ", t)
// 	SendSocketMessage([]uint8{1, 2})
// }

func prettyJson(input string) (string, error) {
	var raw any
	if err := json.Unmarshal([]byte(input), &raw); err != nil {
		return "", err
	}
	pretty, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return "", err
	}
	return string(pretty), nil
}

func jsonWrapper() js.Func {
	jsonFunc := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 1 {
			return "Invalid no of arguments passed"
		}
		inputJSON := args[0].String()
		fmt.Printf("input %s\n", inputJSON)
		pretty, err := prettyJson(inputJSON)
		if err != nil {
			fmt.Printf("unable to convert to json %s\n", err)
			return err.Error()
		}
		return pretty
	})
	return jsonFunc
}
