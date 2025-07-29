import { collapseSourcemaps } from './collapseSourcemaps';
import { hasherByType } from './crypto';
import { decodedSourcemap } from './decodedSourcemap';
import { replacePlaceholders, replacePlaceholdersWithDefaultAndGetContainedPlaceholders, replaceSinglePlaceholder } from './hashPlaceholders';
import { error, logFailedValidation } from './logs';
import { FILE_PLACEHOLDER, lowercaseBundleKeys } from './outputBundle';
import { basename, normalize, resolve } from './path';
import { SOURCEMAPPING_URL } from './sourceMappingURL';
import { timeEnd, timeStart } from './timers';
export async function renderChunks(chunks, bundle, pluginDriver, outputOptions, log) {
    timeStart('render chunks', 2);
    reserveEntryChunksInBundle(chunks);
    const renderedChunks = await Promise.all(chunks.map(chunk => chunk.render()));
    timeEnd('render chunks', 2);
    timeStart('transform chunks', 2);
    const getHash = hasherByType[outputOptions.hashCharacters];
    const chunkGraph = getChunkGraph(chunks);
    const { hashDependenciesByPlaceholder, initialHashesByPlaceholder, nonHashedChunksWithPlaceholders, placeholders, renderedChunksByPlaceholder } = await transformChunksAndGenerateContentHashes(renderedChunks, chunkGraph, outputOptions, pluginDriver, getHash, log);
    const hashesByPlaceholder = generateFinalHashes(renderedChunksByPlaceholder, hashDependenciesByPlaceholder, initialHashesByPlaceholder, placeholders, bundle, getHash);
    addChunksToBundle(renderedChunksByPlaceholder, hashesByPlaceholder, bundle, nonHashedChunksWithPlaceholders, pluginDriver, outputOptions);
    timeEnd('transform chunks', 2);
}
function reserveEntryChunksInBundle(chunks) {
    for (const chunk of chunks) {
        if (chunk.facadeModule && chunk.facadeModule.isUserDefinedEntryPoint) {
            // reserves name in bundle as side effect if it does not contain a hash
            chunk.getPreliminaryFileName();
        }
    }
}
function getChunkGraph(chunks) {
    return Object.fromEntries(chunks.map(chunk => {
        const renderedChunkInfo = chunk.getRenderedChunkInfo();
        return [renderedChunkInfo.fileName, renderedChunkInfo];
    }));
}
async function transformChunk(magicString, fileName, usedModules, chunkGraph, options, outputPluginDriver, log) {
    let map = null;
    const sourcemapChain = [];
    let code = await outputPluginDriver.hookReduceArg0('renderChunk', [magicString.toString(), chunkGraph[fileName], options, { chunks: chunkGraph }], (code, result, plugin) => {
        if (result == null)
            return code;
        if (typeof result === 'string')
            result = {
                code: result,
                map: undefined
            };
        // strict null check allows 'null' maps to not be pushed to the chain, while 'undefined' gets the missing map warning
        if (result.map !== null) {
            const map = decodedSourcemap(result.map);
            sourcemapChain.push(map || { missing: true, plugin: plugin.name });
        }
        return result.code;
    });
    const { compact, dir, file, sourcemap, sourcemapExcludeSources, sourcemapFile, sourcemapPathTransform, sourcemapIgnoreList } = options;
    if (!compact && code[code.length - 1] !== '\n')
        code += '\n';
    if (sourcemap) {
        timeStart('sourcemaps', 3);
        let resultingFile;
        if (file)
            resultingFile = resolve(sourcemapFile || file);
        else if (dir)
            resultingFile = resolve(dir, fileName);
        else
            resultingFile = resolve(fileName);
        const decodedMap = magicString.generateDecodedMap({});
        map = collapseSourcemaps(resultingFile, decodedMap, usedModules, sourcemapChain, sourcemapExcludeSources, log);
        for (let sourcesIndex = 0; sourcesIndex < map.sources.length; ++sourcesIndex) {
            let sourcePath = map.sources[sourcesIndex];
            const sourcemapPath = `${resultingFile}.map`;
            const ignoreList = sourcemapIgnoreList(sourcePath, sourcemapPath);
            if (typeof ignoreList !== 'boolean') {
                error(logFailedValidation('sourcemapIgnoreList function must return a boolean.'));
            }
            if (ignoreList) {
                if (map.x_google_ignoreList === undefined) {
                    map.x_google_ignoreList = [];
                }
                if (!map.x_google_ignoreList.includes(sourcesIndex)) {
                    map.x_google_ignoreList.push(sourcesIndex);
                }
            }
            if (sourcemapPathTransform) {
                sourcePath = sourcemapPathTransform(sourcePath, sourcemapPath);
                if (typeof sourcePath !== 'string') {
                    error(logFailedValidation(`sourcemapPathTransform function must return a string.`));
                }
            }
            map.sources[sourcesIndex] = normalize(sourcePath);
        }
        timeEnd('sourcemaps', 3);
    }
    return {
        code,
        map
    };
}
async function transformChunksAndGenerateContentHashes(renderedChunks, chunkGraph, outputOptions, pluginDriver, getHash, log) {
    const nonHashedChunksWithPlaceholders = [];
    const renderedChunksByPlaceholder = new Map();
    const hashDependenciesByPlaceholder = new Map();
    const initialHashesByPlaceholder = new Map();
    const placeholders = new Set();
    for (const { preliminaryFileName: { hashPlaceholder } } of renderedChunks) {
        if (hashPlaceholder)
            placeholders.add(hashPlaceholder);
    }
    await Promise.all(renderedChunks.map(async ({ chunk, preliminaryFileName: { fileName, hashPlaceholder }, preliminarySourcemapFileName, magicString, usedModules }) => {
        const transformedChunk = {
            chunk,
            fileName,
            sourcemapFileName: preliminarySourcemapFileName?.fileName ?? null,
            ...(await transformChunk(magicString, fileName, usedModules, chunkGraph, outputOptions, pluginDriver, log))
        };
        const { code, map } = transformedChunk;
        if (hashPlaceholder) {
            // To create a reproducible content-only hash, all placeholders are
            // replaced with the same value before hashing
            const { containedPlaceholders, transformedCode } = replacePlaceholdersWithDefaultAndGetContainedPlaceholders(code, placeholders);
            let contentToHash = transformedCode;
            const hashAugmentation = pluginDriver.hookReduceValueSync('augmentChunkHash', '', [chunk.getRenderedChunkInfo()], (augmentation, pluginHash) => {
                if (pluginHash) {
                    augmentation += pluginHash;
                }
                return augmentation;
            });
            if (hashAugmentation) {
                contentToHash += hashAugmentation;
            }
            renderedChunksByPlaceholder.set(hashPlaceholder, transformedChunk);
            hashDependenciesByPlaceholder.set(hashPlaceholder, {
                containedPlaceholders,
                contentHash: getHash(contentToHash)
            });
        }
        else {
            nonHashedChunksWithPlaceholders.push(transformedChunk);
        }
        const sourcemapHashPlaceholder = preliminarySourcemapFileName?.hashPlaceholder;
        if (map && sourcemapHashPlaceholder) {
            initialHashesByPlaceholder.set(preliminarySourcemapFileName.hashPlaceholder, getHash(map.toString()).slice(0, preliminarySourcemapFileName.hashPlaceholder.length));
        }
    }));
    return {
        hashDependenciesByPlaceholder,
        initialHashesByPlaceholder,
        nonHashedChunksWithPlaceholders,
        placeholders,
        renderedChunksByPlaceholder
    };
}
function generateFinalHashes(renderedChunksByPlaceholder, hashDependenciesByPlaceholder, initialHashesByPlaceholder, placeholders, bundle, getHash) {
    const hashesByPlaceholder = new Map(initialHashesByPlaceholder);
    for (const placeholder of placeholders) {
        const { fileName } = renderedChunksByPlaceholder.get(placeholder);
        let contentToHash = '';
        const hashDependencyPlaceholders = new Set([placeholder]);
        for (const dependencyPlaceholder of hashDependencyPlaceholders) {
            const { containedPlaceholders, contentHash } = hashDependenciesByPlaceholder.get(dependencyPlaceholder);
            contentToHash += contentHash;
            for (const containedPlaceholder of containedPlaceholders) {
                // When looping over a map, setting an entry only causes a new iteration if the key is new
                hashDependencyPlaceholders.add(containedPlaceholder);
            }
        }
        let finalFileName;
        let finalHash;
        do {
            // In case of a hash collision, create a hash of the hash
            if (finalHash) {
                contentToHash = finalHash;
            }
            finalHash = getHash(contentToHash).slice(0, placeholder.length);
            finalFileName = replaceSinglePlaceholder(fileName, placeholder, finalHash);
        } while (bundle[lowercaseBundleKeys].has(finalFileName.toLowerCase()));
        bundle[finalFileName] = FILE_PLACEHOLDER;
        hashesByPlaceholder.set(placeholder, finalHash);
    }
    return hashesByPlaceholder;
}
function addChunksToBundle(renderedChunksByPlaceholder, hashesByPlaceholder, bundle, nonHashedChunksWithPlaceholders, pluginDriver, options) {
    for (const { chunk, code, fileName, sourcemapFileName, map } of renderedChunksByPlaceholder.values()) {
        let updatedCode = replacePlaceholders(code, hashesByPlaceholder);
        const finalFileName = replacePlaceholders(fileName, hashesByPlaceholder);
        let finalSourcemapFileName = null;
        if (map) {
            if (options.sourcemapDebugIds) {
                updatedCode += calculateDebugIdAndGetComment(updatedCode, map);
            }
            finalSourcemapFileName = sourcemapFileName
                ? replacePlaceholders(sourcemapFileName, hashesByPlaceholder)
                : `${finalFileName}.map`;
            map.file = replacePlaceholders(map.file, hashesByPlaceholder);
            updatedCode += emitSourceMapAndGetComment(finalSourcemapFileName, map, pluginDriver, options);
        }
        bundle[finalFileName] = chunk.finalizeChunk(updatedCode, map, finalSourcemapFileName, hashesByPlaceholder);
    }
    for (const { chunk, code, fileName, sourcemapFileName, map } of nonHashedChunksWithPlaceholders) {
        let updatedCode = hashesByPlaceholder.size > 0 ? replacePlaceholders(code, hashesByPlaceholder) : code;
        let finalSourcemapFileName = null;
        if (map) {
            if (options.sourcemapDebugIds) {
                updatedCode += calculateDebugIdAndGetComment(updatedCode, map);
            }
            finalSourcemapFileName = sourcemapFileName
                ? replacePlaceholders(sourcemapFileName, hashesByPlaceholder)
                : `${fileName}.map`;
            updatedCode += emitSourceMapAndGetComment(finalSourcemapFileName, map, pluginDriver, options);
        }
        bundle[fileName] = chunk.finalizeChunk(updatedCode, map, finalSourcemapFileName, hashesByPlaceholder);
    }
}
function emitSourceMapAndGetComment(fileName, map, pluginDriver, { sourcemap, sourcemapBaseUrl }) {
    let url;
    if (sourcemap === 'inline') {
        url = map.toUrl();
    }
    else {
        const sourcemapFileName = basename(fileName);
        url = sourcemapBaseUrl
            ? new URL(sourcemapFileName, sourcemapBaseUrl).toString()
            : sourcemapFileName;
        pluginDriver.emitFile({
            fileName,
            originalFileName: null,
            source: map.toString(),
            type: 'asset'
        });
    }
    return sourcemap === 'hidden' ? '' : `//# ${SOURCEMAPPING_URL}=${url}\n`;
}
function calculateDebugIdAndGetComment(code, map) {
    const hash = hasherByType.hex(code);
    const debugId = [
        hash.slice(0, 8),
        hash.slice(8, 12),
        '4' + hash.slice(12, 15),
        ((parseInt(hash.slice(15, 16), 16) & 3) | 8).toString(16) + hash.slice(17, 20),
        hash.slice(20, 32)
    ].join('-');
    map.debugId = debugId;
    return '//# debugId=' + debugId + '\n';
}
