import picomatch from 'picomatch';
import { ensureArray } from './ensureArray';
import { isAbsolute, normalize, resolve } from './path';
function getMatcherString(glob, cwd) {
    if (glob.startsWith('**') || isAbsolute(glob)) {
        return normalize(glob);
    }
    const resolved = resolve(cwd, glob);
    return normalize(resolved);
}
function patternToIdFilter(pattern) {
    if (pattern instanceof RegExp) {
        return (id) => {
            const normalizedId = normalize(id);
            const result = pattern.test(normalizedId);
            pattern.lastIndex = 0;
            return result;
        };
    }
    const cwd = process.cwd();
    const glob = getMatcherString(pattern, cwd);
    const matcher = picomatch(glob, { dot: true });
    return (id) => {
        const normalizedId = normalize(id);
        return matcher(normalizedId);
    };
}
function patternToCodeFilter(pattern) {
    if (pattern instanceof RegExp) {
        return (code) => {
            const result = pattern.test(code);
            pattern.lastIndex = 0;
            return result;
        };
    }
    return (code) => code.includes(pattern);
}
function createFilter(exclude, include) {
    if (!exclude && !include) {
        return;
    }
    return input => {
        if (exclude?.some(filter => filter(input))) {
            return false;
        }
        if (include?.some(filter => filter(input))) {
            return true;
        }
        return !(include && include.length > 0);
    };
}
function normalizeFilter(filter) {
    if (typeof filter === 'string' || filter instanceof RegExp) {
        return {
            include: [filter]
        };
    }
    if (Array.isArray(filter)) {
        return {
            include: filter
        };
    }
    return {
        exclude: filter.exclude ? ensureArray(filter.exclude) : undefined,
        include: filter.include ? ensureArray(filter.include) : undefined
    };
}
function createIdFilter(filter) {
    if (!filter)
        return;
    const { exclude, include } = normalizeFilter(filter);
    const excludeFilter = exclude?.map(patternToIdFilter);
    const includeFilter = include?.map(patternToIdFilter);
    return createFilter(excludeFilter, includeFilter);
}
function createCodeFilter(filter) {
    if (!filter)
        return;
    const { exclude, include } = normalizeFilter(filter);
    const excludeFilter = exclude?.map(patternToCodeFilter);
    const includeFilter = include?.map(patternToCodeFilter);
    return createFilter(excludeFilter, includeFilter);
}
export function createFilterForId(filter) {
    const filterFunction = createIdFilter(filter);
    return filterFunction ? id => !!filterFunction(id) : undefined;
}
export function createFilterForTransform(idFilter, codeFilter) {
    if (!idFilter && !codeFilter)
        return;
    const idFilterFunction = createIdFilter(idFilter);
    const codeFilterFunction = createCodeFilter(codeFilter);
    return (id, code) => {
        let fallback = true;
        if (idFilterFunction) {
            fallback &&= idFilterFunction(id);
        }
        if (!fallback) {
            return false;
        }
        if (codeFilterFunction) {
            fallback &&= codeFilterFunction(code);
        }
        return fallback;
    };
}
