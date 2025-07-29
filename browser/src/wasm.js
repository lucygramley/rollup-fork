export { parse, xxhashBase16, xxhashBase36, xxhashBase64Url } from '../../wasm/bindings_wasm.js';
import { parse } from '../../wasm/bindings_wasm.js';
export async function parseAsync(code, allowReturnOutsideFunction, jsx, _signal) {
    return parse(code, allowReturnOutsideFunction, jsx);
}
