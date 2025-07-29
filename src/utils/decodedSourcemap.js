import { decode, encode } from '@jridgewell/sourcemap-codec';
const sourceMapCache = new WeakMap();
/**
 * This clears the decoded array and falls back to the encoded string form.
 * Sourcemap mappings arrays can be very large and holding on to them for longer
 * than is necessary leads to poor heap utilization.
 */
function resetCacheToEncoded(cache) {
    if (cache.encodedMappings === undefined && cache.decodedMappings) {
        cache.encodedMappings = encode(cache.decodedMappings);
    }
    cache.decodedMappings = undefined;
}
export function resetSourcemapCache(map, sourcemapChain) {
    if (map) {
        const cache = sourceMapCache.get(map);
        if (cache) {
            resetCacheToEncoded(cache);
        }
    }
    if (!sourcemapChain) {
        return;
    }
    for (const map of sourcemapChain) {
        if (map.missing)
            continue;
        resetSourcemapCache(map);
    }
}
export function decodedSourcemap(map) {
    if (!map)
        return null;
    if (typeof map === 'string') {
        map = JSON.parse(map);
    }
    if (!map.mappings) {
        return {
            mappings: [],
            names: [],
            sources: [],
            version: 3
        };
    }
    const originalMappings = map.mappings;
    const isAlreadyDecoded = Array.isArray(originalMappings);
    const cache = {
        decodedMappings: isAlreadyDecoded ? originalMappings : undefined,
        encodedMappings: isAlreadyDecoded ? undefined : originalMappings
    };
    const decodedMap = {
        ...map,
        // By moving mappings behind an accessor, we can avoid unneeded computation for cases
        // where the mappings field is never actually accessed. This appears to greatly reduce
        // the overhead of sourcemap decoding in terms of both compute time and memory usage.
        get mappings() {
            if (cache.decodedMappings) {
                return cache.decodedMappings;
            }
            // If decodedMappings doesn't exist then encodedMappings should.
            // The only scenario where cache.encodedMappings should be undefined is if the map
            // this was constructed from was already decoded, or if mappings was set to a new
            // decoded string. In either case, this line shouldn't get hit.
            cache.decodedMappings = cache.encodedMappings ? decode(cache.encodedMappings) : [];
            cache.encodedMappings = undefined;
            return cache.decodedMappings;
        }
    };
    sourceMapCache.set(decodedMap, cache);
    return decodedMap;
}
