import path from 'node:path';
import { fileURLToPath } from 'node:url';
const resolve = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const JS_REPLACED_MODULES = ['fs', 'hookActions', 'path', 'performance', 'process', 'initWasm'];
const jsModulesMap = JS_REPLACED_MODULES.flatMap(module => {
    const originalId = resolve(`src/utils/${module}`);
    const replacementId = resolve(`browser/src/${module}.ts`);
    return [
        [originalId, replacementId],
        [`${originalId}.ts`, replacementId]
    ];
});
const wasmModulesMap = [[resolve('native'), resolve('browser/src/wasm.ts')]];
const resolutions = new Map([...jsModulesMap, ...wasmModulesMap]);
export default function replaceBrowserModules() {
    return {
        apply: 'serve',
        enforce: 'pre',
        name: 'replace-browser-modules',
        resolveId(source, importer) {
            if (importer && source[0] === '.') {
                return resolutions.get(path.join(path.dirname(importer), source));
            }
        },
        transformIndexHtml(html) {
            // Unfortunately, picomatch sneaks as a dependency into the dev bundle.
            // This fixes an error.
            return html.replace('</head>', '<script>window.process={}</script></head>');
        }
    };
}
