import { readFile } from 'node:fs/promises';
export function emitNativeEntry() {
    return {
        async generateBundle() {
            this.emitFile({
                fileName: 'native.js',
                source: await readFile(new URL('../native.js', import.meta.url)),
                type: 'asset'
            });
        },
        name: 'emit-native-entry'
    };
}
