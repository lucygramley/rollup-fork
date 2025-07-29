import { asyncFlatten } from '../asyncFlatten';
import { EMPTY_ARRAY } from '../blank';
import { LOGLEVEL_DEBUG, LOGLEVEL_ERROR, LOGLEVEL_WARN, logLevelPriority } from '../logging';
import { error, logInvalidOption, logUnknownOption } from '../logs';
import { printQuotedStringList } from '../printStringList';
export const getOnLog = (config, logLevel, printLog = defaultPrintLog) => {
    const { onwarn, onLog } = config;
    const defaultOnLog = getDefaultOnLog(printLog, onwarn);
    if (onLog) {
        const minimalPriority = logLevelPriority[logLevel];
        return (level, log) => onLog(level, addLogToString(log), (level, handledLog) => {
            if (level === LOGLEVEL_ERROR) {
                return error(normalizeLog(handledLog));
            }
            if (logLevelPriority[level] >= minimalPriority) {
                defaultOnLog(level, normalizeLog(handledLog));
            }
        });
    }
    return defaultOnLog;
};
const getDefaultOnLog = (printLog, onwarn) => onwarn
    ? (level, log) => {
        if (level === LOGLEVEL_WARN) {
            onwarn(addLogToString(log), warning => printLog(LOGLEVEL_WARN, normalizeLog(warning)));
        }
        else {
            printLog(level, log);
        }
    }
    : printLog;
const addLogToString = (log) => {
    Object.defineProperty(log, 'toString', {
        value: () => log.message,
        writable: true
    });
    return log;
};
export const normalizeLog = (log) => typeof log === 'string'
    ? { message: log }
    : typeof log === 'function'
        ? normalizeLog(log())
        : log;
const defaultPrintLog = (level, { message }) => {
    switch (level) {
        case LOGLEVEL_WARN: {
            return console.warn(message);
        }
        case LOGLEVEL_DEBUG: {
            return console.debug(message);
        }
        default: {
            return console.info(message);
        }
    }
};
export function warnUnknownOptions(passedOptions, validOptions, optionType, log, ignoredKeys = /$./) {
    const validOptionSet = new Set(validOptions);
    const unknownOptions = Object.keys(passedOptions).filter(key => !(validOptionSet.has(key) || ignoredKeys.test(key)));
    if (unknownOptions.length > 0) {
        log(LOGLEVEL_WARN, logUnknownOption(optionType, unknownOptions, [...validOptionSet].sort()));
    }
}
export const treeshakePresets = {
    recommended: {
        annotations: true,
        correctVarValueBeforeDeclaration: false,
        manualPureFunctions: EMPTY_ARRAY,
        moduleSideEffects: () => true,
        propertyReadSideEffects: true,
        tryCatchDeoptimization: true,
        unknownGlobalSideEffects: false
    },
    safest: {
        annotations: true,
        correctVarValueBeforeDeclaration: true,
        manualPureFunctions: EMPTY_ARRAY,
        moduleSideEffects: () => true,
        propertyReadSideEffects: true,
        tryCatchDeoptimization: true,
        unknownGlobalSideEffects: true
    },
    smallest: {
        annotations: true,
        correctVarValueBeforeDeclaration: false,
        manualPureFunctions: EMPTY_ARRAY,
        moduleSideEffects: () => false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
        unknownGlobalSideEffects: false
    }
};
export const jsxPresets = {
    preserve: {
        factory: null,
        fragment: null,
        importSource: null,
        mode: 'preserve'
    },
    'preserve-react': {
        factory: 'React.createElement',
        fragment: 'React.Fragment',
        importSource: 'react',
        mode: 'preserve'
    },
    react: {
        factory: 'React.createElement',
        fragment: 'React.Fragment',
        importSource: 'react',
        mode: 'classic'
    },
    'react-jsx': {
        factory: 'React.createElement',
        importSource: 'react',
        jsxImportSource: 'react/jsx-runtime',
        mode: 'automatic'
    }
};
export const generatedCodePresets = {
    es2015: {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true
    },
    es5: {
        arrowFunctions: false,
        constBindings: false,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: false
    }
};
export const objectifyOption = (value) => value && typeof value === 'object' ? value : {};
export const objectifyOptionWithPresets = (presets, optionName, urlSnippet, additionalValues) => (value) => {
    if (typeof value === 'string') {
        const preset = presets[value];
        if (preset) {
            return preset;
        }
        error(logInvalidOption(optionName, urlSnippet, `valid values are ${additionalValues}${printQuotedStringList(Object.keys(presets))}. You can also supply an object for more fine-grained control`, value));
    }
    return objectifyOption(value);
};
export const getOptionWithPreset = (value, presets, optionName, urlSnippet, additionalValues) => {
    const presetName = value?.preset;
    if (presetName) {
        const preset = presets[presetName];
        if (preset) {
            return { ...preset, ...value };
        }
        else {
            error(logInvalidOption(`${optionName}.preset`, urlSnippet, `valid values are ${printQuotedStringList(Object.keys(presets))}`, presetName));
        }
    }
    return objectifyOptionWithPresets(presets, optionName, urlSnippet, additionalValues)(value);
};
export const normalizePluginOption = async (plugins) => (await asyncFlatten([plugins])).filter(Boolean);
