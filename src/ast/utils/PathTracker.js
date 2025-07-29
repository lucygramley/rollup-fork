import { EMPTY_OBJECT } from '../../utils/blank';
import { getNewSet, getOrCreate } from '../../utils/getOrCreate';
export const UnknownKey = Symbol('Unknown Key');
export const UnknownNonAccessorKey = Symbol('Unknown Non-Accessor Key');
export const UnknownInteger = Symbol('Unknown Integer');
export const SymbolToStringTag = Symbol('Symbol.toStringTag');
export const EMPTY_PATH = [];
export const UNKNOWN_PATH = [UnknownKey];
// For deoptimizations, this means we are modifying an unknown property but did
// not lose track of the object or are creating a setter/getter;
// For assignment effects it means we do not check for setter/getter effects
// but only if something is mutated that is included, which is relevant for
// Object.defineProperty
export const UNKNOWN_NON_ACCESSOR_PATH = [UnknownNonAccessorKey];
export const UNKNOWN_INTEGER_PATH = [UnknownInteger];
const EntitiesKey = Symbol('Entities');
export class EntityPathTracker {
    constructor() {
        this.entityPaths = Object.create(null, {
            [EntitiesKey]: { value: new Set() }
        });
    }
    trackEntityAtPathAndGetIfTracked(path, entity) {
        const trackedEntities = this.getEntities(path);
        if (trackedEntities.has(entity))
            return true;
        trackedEntities.add(entity);
        return false;
    }
    withTrackedEntityAtPath(path, entity, onUntracked, returnIfTracked) {
        const trackedEntities = this.getEntities(path);
        if (trackedEntities.has(entity))
            return returnIfTracked;
        trackedEntities.add(entity);
        const result = onUntracked();
        trackedEntities.delete(entity);
        return result;
    }
    getEntities(path) {
        let currentPaths = this.entityPaths;
        for (const pathSegment of path) {
            currentPaths = currentPaths[pathSegment] ||= Object.create(null, {
                [EntitiesKey]: { value: new Set() }
            });
        }
        return currentPaths[EntitiesKey];
    }
}
export const SHARED_RECURSION_TRACKER = new EntityPathTracker();
export class DiscriminatedPathTracker {
    constructor() {
        this.entityPaths = Object.create(null, {
            [EntitiesKey]: { value: new Map() }
        });
    }
    trackEntityAtPathAndGetIfTracked(path, discriminator, entity) {
        let currentPaths = this.entityPaths;
        for (const pathSegment of path) {
            currentPaths = currentPaths[pathSegment] ||= Object.create(null, {
                [EntitiesKey]: { value: new Map() }
            });
        }
        const trackedEntities = getOrCreate(currentPaths[EntitiesKey], discriminator, (getNewSet));
        if (trackedEntities.has(entity))
            return true;
        trackedEntities.add(entity);
        return false;
    }
}
const UNKNOWN_INCLUDED_PATH = Object.freeze({ [UnknownKey]: EMPTY_OBJECT });
export class IncludedFullPathTracker {
    constructor() {
        this.includedPaths = null;
    }
    includePathAndGetIfIncluded(path) {
        let included = true;
        let parent = this;
        let parentSegment = 'includedPaths';
        let currentPaths = (this.includedPaths ||=
            ((included = false), Object.create(null)));
        for (const pathSegment of path) {
            // This means from here, all paths are included
            if (currentPaths[UnknownKey]) {
                return true;
            }
            // Including UnknownKey automatically includes all nested paths.
            // From above, we know that UnknownKey is not included yet.
            if (typeof pathSegment === 'symbol') {
                // Hopefully, this saves some memory over just setting
                // currentPaths[UnknownKey] = EMPTY_OBJECT
                parent[parentSegment] = UNKNOWN_INCLUDED_PATH;
                return false;
            }
            parent = currentPaths;
            parentSegment = pathSegment;
            currentPaths = currentPaths[pathSegment] ||= ((included = false), Object.create(null));
        }
        return included;
    }
}
const UNKNOWN_INCLUDED_TOP_LEVEL_PATH = Object.freeze({
    [UnknownKey]: true
});
export class IncludedTopLevelPathTracker {
    constructor() {
        this.includedPaths = null;
    }
    includePathAndGetIfIncluded(path) {
        let included = true;
        const includedPaths = (this.includedPaths ||=
            ((included = false), Object.create(null)));
        if (includedPaths[UnknownKey]) {
            return true;
        }
        const [firstPathSegment, secondPathSegment] = path;
        if (!firstPathSegment) {
            return included;
        }
        if (typeof firstPathSegment === 'symbol') {
            this.includedPaths = UNKNOWN_INCLUDED_TOP_LEVEL_PATH;
            return false;
        }
        if (secondPathSegment) {
            if (includedPaths[firstPathSegment] === UnknownKey) {
                return true;
            }
            includedPaths[firstPathSegment] = UnknownKey;
            return false;
        }
        if (includedPaths[firstPathSegment]) {
            return true;
        }
        includedPaths[firstPathSegment] = true;
        return false;
    }
    includeAllPaths(entity, context, basePath) {
        const { includedPaths } = this;
        if (includedPaths) {
            if (includedPaths[UnknownKey]) {
                entity.includePath([...basePath, UnknownKey], context);
            }
            else {
                const inclusionEntries = Object.entries(includedPaths);
                if (inclusionEntries.length === 0) {
                    entity.includePath(basePath, context);
                }
                else {
                    for (const [key, value] of inclusionEntries) {
                        entity.includePath(value === UnknownKey ? [...basePath, key, UnknownKey] : [...basePath, key], context);
                    }
                }
            }
        }
    }
}
