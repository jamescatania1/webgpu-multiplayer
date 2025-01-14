import "./wasm_exec";
import init from "./main.wasm?init";

onmessage = (e: MessageEvent) => {
	console.log("wasm wrapper received ", e.data);
	// input and stuff will go here prolly
};

const global = globalThis as any;

global.onSocketOpen = () => {
	postMessage("socket open");
};

global.onSocketClose = () => {
	postMessage("socket closed");
};

const runWasm = async () => {
	// @ts-ignore
	const go = new Go();
	go.run(await init(go.importObject));
};

runWasm();
