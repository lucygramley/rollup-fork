import { version as rollupVersion } from 'package.json';
import Bundle from '../Bundle';
import Graph from '../Graph';
import { catchUnfinishedHookActions } from '../utils/hookActions';
import initWasm from '../utils/initWasm';
import { getLogger } from '../utils/logger';
import { LOGLEVEL_DEBUG, LOGLEVEL_INFO, LOGLEVEL_WARN } from '../utils/logging';
import { getLogHandler } from '../utils/logHandler';
import { error, getRollupError, logAlreadyClosed, logCannotEmitFromOptionsHook, logMissingFileOrDirOption, logPluginError } from '../utils/logs';
import { normalizeInputOptions } from '../utils/options/normalizeInputOptions';
import { normalizeOutputOptions } from '../utils/options/normalizeOutputOptions';
import { getOnLog, normalizeLog, normalizePluginOption } from '../utils/options/options';
import { dirname, resolve } from '../utils/path';
import { getSortedValidatedPlugins } from '../utils/PluginDriver';
import { ANONYMOUS_OUTPUT_PLUGIN_PREFIX, ANONYMOUS_PLUGIN_PREFIX } from '../utils/pluginNames';
import { getTimings, initialiseTimers, timeEnd, timeStart } from '../utils/timers';
// @ts-expect-error TS2540: the polyfill of `asyncDispose`.
Symbol.asyncDispose ??= Symbol('Symbol.asyncDispose');
export default function rollup(rawInputOptions) {
    return rollupInternal(rawInputOptions, null);
}
export async function rollupInternal(rawInputOptions, watcher) {
    const { options: inputOptions, unsetOptions: unsetInputOptions } = await getInputOptions(rawInputOptions, watcher !== null);
    initialiseTimers(inputOptions);
    await initWasm();
    const graph = new Graph(inputOptions, watcher);
    // remove the cache object from the memory after graph creation (cache is not used anymore)
    const useCache = rawInputOptions.cache !== false;
    if (rawInputOptions.cache) {
        inputOptions.cache = undefined;
        rawInputOptions.cache = undefined;
    }
    timeStart('BUILD', 1);
    await catchUnfinishedHookActions(graph.pluginDriver, async () => {
        try {
            timeStart('initialize', 2);
            await graph.pluginDriver.hookParallel('buildStart', [inputOptions]);
            timeEnd('initialize', 2);
            await graph.build();
        }
        catch (error_) {
            const watchFiles = Object.keys(graph.watchFiles);
            if (watchFiles.length > 0) {
                error_.watchFiles = watchFiles;
            }
            try {
                await graph.pluginDriver.hookParallel('buildEnd', [error_]);
            }
            catch (buildEndError) {
                // Create a compound error object to include both errors, based on the original error
                const compoundError = getRollupError({
                    ...error_,
                    message: `There was an error during the build:\n  ${error_.message}\nAdditionally, handling the error in the 'buildEnd' hook caused the following error:\n  ${buildEndError.message}`
                });
                await graph.pluginDriver.hookParallel('closeBundle', [compoundError]);
                throw compoundError;
            }
            await graph.pluginDriver.hookParallel('closeBundle', [error_]);
            throw error_;
        }
        try {
            await graph.pluginDriver.hookParallel('buildEnd', []);
        }
        catch (buildEndError) {
            await graph.pluginDriver.hookParallel('closeBundle', [buildEndError]);
            throw buildEndError;
        }
    });
    timeEnd('BUILD', 1);
    const result = {
        cache: useCache ? graph.getCache() : undefined,
        async close() {
            if (result.closed)
                return;
            result.closed = true;
            await graph.pluginDriver.hookParallel('closeBundle', []);
        },
        closed: false,
        async [Symbol.asyncDispose]() {
            await this.close();
        },
        async generate(rawOutputOptions) {
            if (result.closed)
                return error(logAlreadyClosed());
            return handleGenerateWrite(false, inputOptions, unsetInputOptions, rawOutputOptions, graph);
        },
        get watchFiles() {
            return Object.keys(graph.watchFiles);
        },
        async write(rawOutputOptions) {
            if (result.closed)
                return error(logAlreadyClosed());
            return handleGenerateWrite(true, inputOptions, unsetInputOptions, rawOutputOptions, graph);
        }
    };
    if (inputOptions.perf)
        result.getTimings = getTimings;
    return result;
}
async function getInputOptions(initialInputOptions, watchMode) {
    if (!initialInputOptions) {
        throw new Error('You must supply an options object to rollup');
    }
    const processedInputOptions = await getProcessedInputOptions(initialInputOptions, watchMode);
    const { options, unsetOptions } = await normalizeInputOptions(processedInputOptions, watchMode);
    normalizePlugins(options.plugins, ANONYMOUS_PLUGIN_PREFIX);
    return { options, unsetOptions };
}
async function getProcessedInputOptions(inputOptions, watchMode) {
    const plugins = getSortedValidatedPlugins('options', await normalizePluginOption(inputOptions.plugins));
    const logLevel = inputOptions.logLevel || LOGLEVEL_INFO;
    const logger = getLogger(plugins, getOnLog(inputOptions, logLevel), watchMode, logLevel);
    for (const plugin of plugins) {
        const { name, options } = plugin;
        const handler = 'handler' in options ? options.handler : options;
        const processedOptions = await handler.call({
            debug: getLogHandler(LOGLEVEL_DEBUG, 'PLUGIN_LOG', logger, name, logLevel),
            error: (error_) => error(logPluginError(normalizeLog(error_), name, { hook: 'onLog' })),
            info: getLogHandler(LOGLEVEL_INFO, 'PLUGIN_LOG', logger, name, logLevel),
            meta: { rollupVersion, watchMode },
            warn: getLogHandler(LOGLEVEL_WARN, 'PLUGIN_WARNING', logger, name, logLevel)
        }, inputOptions);
        if (processedOptions) {
            inputOptions = processedOptions;
        }
    }
    return inputOptions;
}
function normalizePlugins(plugins, anonymousPrefix) {
    for (const [index, plugin] of plugins.entries()) {
        if (!plugin.name) {
            plugin.name = `${anonymousPrefix}${index + 1}`;
        }
    }
}
async function handleGenerateWrite(isWrite, inputOptions, unsetInputOptions, rawOutputOptions, graph) {
    const { options: outputOptions, outputPluginDriver, unsetOptions } = await getOutputOptionsAndPluginDriver(rawOutputOptions, graph.pluginDriver, inputOptions, unsetInputOptions);
    return catchUnfinishedHookActions(outputPluginDriver, async () => {
        const bundle = new Bundle(outputOptions, unsetOptions, inputOptions, outputPluginDriver, graph);
        const generated = await bundle.generate(isWrite);
        if (isWrite) {
            timeStart('WRITE', 1);
            if (!outputOptions.dir && !outputOptions.file) {
                return error(logMissingFileOrDirOption());
            }
            await Promise.all(Object.values(generated).map(chunk => graph.fileOperationQueue.run(() => writeOutputFile(chunk, outputOptions, inputOptions))));
            await outputPluginDriver.hookParallel('writeBundle', [outputOptions, generated]);
            timeEnd('WRITE', 1);
        }
        return createOutput(generated);
    });
}
async function getOutputOptionsAndPluginDriver(rawOutputOptions, inputPluginDriver, inputOptions, unsetInputOptions) {
    if (!rawOutputOptions) {
        throw new Error('You must supply an options object');
    }
    const rawPlugins = await normalizePluginOption(rawOutputOptions.plugins);
    normalizePlugins(rawPlugins, ANONYMOUS_OUTPUT_PLUGIN_PREFIX);
    const outputPluginDriver = inputPluginDriver.createOutputPluginDriver(rawPlugins);
    return {
        ...(await getOutputOptions(inputOptions, unsetInputOptions, rawOutputOptions, outputPluginDriver)),
        outputPluginDriver
    };
}
function getOutputOptions(inputOptions, unsetInputOptions, rawOutputOptions, outputPluginDriver) {
    return normalizeOutputOptions(outputPluginDriver.hookReduceArg0Sync('outputOptions', [rawOutputOptions], (outputOptions, result) => result || outputOptions, pluginContext => {
        const emitError = () => pluginContext.error(logCannotEmitFromOptionsHook());
        return {
            ...pluginContext,
            emitFile: emitError,
            setAssetSource: emitError
        };
    }), inputOptions, unsetInputOptions);
}
function createOutput(outputBundle) {
    return {
        output: Object.values(outputBundle).filter(outputFile => Object.keys(outputFile).length > 0).sort((outputFileA, outputFileB) => getSortingFileType(outputFileA) - getSortingFileType(outputFileB))
    };
}
var SortingFileType;
(function (SortingFileType) {
    SortingFileType[SortingFileType["ENTRY_CHUNK"] = 0] = "ENTRY_CHUNK";
    SortingFileType[SortingFileType["SECONDARY_CHUNK"] = 1] = "SECONDARY_CHUNK";
    SortingFileType[SortingFileType["ASSET"] = 2] = "ASSET";
})(SortingFileType || (SortingFileType = {}));
function getSortingFileType(file) {
    if (file.type === 'asset') {
        return SortingFileType.ASSET;
    }
    if (file.isEntry) {
        return SortingFileType.ENTRY_CHUNK;
    }
    return SortingFileType.SECONDARY_CHUNK;
}
async function writeOutputFile(outputFile, outputOptions, { fs: { mkdir, writeFile } }) {
    const fileName = resolve(outputOptions.dir || dirname(outputOptions.file), outputFile.fileName);
    // 'recursive: true' does not throw if the folder structure, or parts of it, already exist
    await mkdir(dirname(fileName), { recursive: true });
    return writeFile(fileName, outputFile.type === 'asset' ? outputFile.source : outputFile.code);
}
/**
 * Auxiliary function for defining rollup configuration
 * Mainly to facilitate IDE code prompts, after all, export default does not
 * prompt, even if you add @type annotations, it is not accurate
 * @param options
 */
export function defineConfig(options) {
    return options;
}
