import fs from 'node:fs/promises';
export default function emitWasmFile() {
    return {
        async generateBundle() {
            this.emitFile({
                fileName: 'bindings_wasm_bg.wasm',
                source: await fs.readFile('wasm/bindings_wasm_bg.wasm'),
                type: 'asset'
            });
        },
        name: 'emit-wasm-file'
    };
}
