import ExternalModule from '../ExternalModule';
import Module from '../Module';
import { getNewSet, getOrCreate } from './getOrCreate';
import { concatLazy } from './iterators';
import { logOptimizeChunkStatus } from './logs';
import { timeEnd, timeStart } from './timers';
/**
 * At its core, the algorithm first starts from each static or dynamic entry
 * point and then assigns that entry point to all modules than can be reached
 * via static imports. We call this the *dependent entry points* of that
 * module.
 *
 * Then we group all modules with the same dependent entry points into chunks
 * as those modules will always be loaded together.
 *
 * One non-trivial optimization we can apply is that dynamic entries are
 * different from static entries in so far as when a dynamic import occurs,
 * some modules are already in memory. If some of these modules are also
 * dependencies of the dynamic entry, then it does not make sense to create a
 * separate chunk for them. Instead, the dynamic import target can load them
 * from the importing chunk.
 *
 * With regard to chunking, if B is implicitly loaded after A, then this can be
 * handled the same way as if there was a dynamic import A => B.
 *
 * Example:
 * Assume A -> B (A imports B), A => C (A dynamically imports C) and C -> B.
 * Then the initial algorithm would assign A into the A chunk, C into the C
 * chunk and B into the AC chunk, i.e. the chunk with the dependent entry
 * points A and C.
 * However we know that C can only be loaded from A, so A and its dependency B
 * must already be in memory when C is loaded. So it is enough to create only
 * two chunks A containing [AB] and C containing [C].
 *
 * So we do not assign the dynamic entry C as dependent entry point to modules
 * that are already loaded.
 *
 * In a more complex example, let us assume that we have entry points X and Y.
 * Further, let us assume
 * X -> A, X -> B, X -> C,
 * Y -> A, Y -> B,
 * A => D,
 * D -> B, D -> C
 * So without dynamic import optimization, the dependent entry points are
 * A: XY, B: DXY, C: DX, D: D, X: X, Y: Y, so we would for now create six
 * chunks.
 *
 * Now D is loaded only after A is loaded. But A is loaded if either X is
 * loaded or Y is loaded. So the modules that are already in memory when D is
 * loaded are the intersection of all modules that X depends on with all
 * modules that Y depends on, which in this case are the modules A and B.
 * We could also say they are all modules that have both X and Y as dependent
 * entry points.
 *
 * So we can remove D as dependent entry point from A and B, which means they
 * both now have only XY as dependent entry points and can be merged into the
 * same chunk.
 *
 * Now let us extend this to the most general case where we have several
 * dynamic importers for one dynamic entry point.
 *
 * In the most general form, it works like this:
 * For each dynamic entry point, we have a number of dynamic importers, which
 * are the modules importing it. Using the previous ideas, we can determine
 * the modules already in memory for each dynamic importer by looking for all
 * modules that have all the dependent entry points of the dynamic importer as
 * dependent entry points.
 * So the modules that are guaranteed to be in memory when the dynamic entry
 * point is loaded are the intersection of the modules already in memory for
 * each dynamic importer.
 *
 * Assuming that A => D and B => D and A has dependent entry points XY and B
 * has dependent entry points YZ, then the modules guaranteed to be in memory
 * are all modules that have at least XYZ as dependent entry points.
 * We call XYZ the *dynamically dependent entry points* of D.
 *
 * Now there is one last case to consider: If one of the dynamically dependent
 * entries is itself a dynamic entry, then any module is in memory that either
 * is a dependency of that dynamic entry or again has the dynamic dependent
 * entries of that dynamic entry as dependent entry points.
 *
 * A naive algorithm for this proved to be costly as it contained an O(n^3)
 * complexity with regard to dynamic entries that blew up for very large
 * projects.
 *
 * If we have an efficient way to do Set operations, an alternative approach
 * would be to instead collect already loaded modules per dynamic entry. And as
 * all chunks from the initial grouping would behave the same, we can instead
 * collect already loaded chunks for a performance improvement.
 *
 * To do that efficiently, need
 * - a Map of dynamic imports per dynamic entry, which contains all dynamic
 *   imports that can be triggered by a dynamic entry
 * - a Map of static dependencies per entry
 * - a Map of already loaded chunks per entry that we initially populate with
 *   empty Sets for static entries and Sets containing all entries for dynamic
 *   entries
 *
 * For efficient operations, we assign each entry a numerical index and
 * represent Sets of Chunks as BigInt values where each chunk corresponds to a
 * bit index. Then the last two maps can be represented as arrays of BigInt
 * values.
 *
 * Then we iterate through each dynamic entry. We set the already loaded modules
 * to the intersection of the previously already loaded modules with the union
 * of the already loaded modules of that chunk with its static dependencies.
 *
 * If the already loaded modules changed, then we use the Map of dynamic imports
 * per dynamic entry to marks all dynamic entry dependencies as "dirty" and put
 * them back into the iteration. As an additional optimization, we note for
 * each dynamic entry which dynamic dependent entries have changed and only
 * intersect those entries again on subsequent interations.
 *
 * Then we remove the dynamic entries from the list of dependent entries for
 * those chunks that are already loaded for that dynamic entry and create
 * another round of chunks.
 */
export function getChunkAssignments(entries, manualChunkAliasByEntry, minChunkSize, log) {
    const { chunkDefinitions, modulesInManualChunks } = getChunkDefinitionsFromManualChunks(manualChunkAliasByEntry);
    const { allEntries, dependentEntriesByModule, dynamicallyDependentEntriesByDynamicEntry, dynamicImportsByEntry, dynamicallyDependentEntriesByAwaitedDynamicEntry, awaitedDynamicImportsByEntry } = analyzeModuleGraph(entries);
    // Each chunk is identified by its position in this array
    const chunkAtoms = getChunksWithSameDependentEntries(getModulesWithDependentEntries(dependentEntriesByModule, modulesInManualChunks));
    const staticDependencyAtomsByEntry = getStaticDependencyAtomsByEntry(allEntries, chunkAtoms);
    // Warning: This will consume dynamicallyDependentEntriesByDynamicEntry.
    // If we no longer want this, we should make a copy here.
    const alreadyLoadedAtomsByEntry = getAlreadyLoadedAtomsByEntry(staticDependencyAtomsByEntry, dynamicallyDependentEntriesByDynamicEntry, dynamicImportsByEntry, allEntries);
    const awaitedAlreadyLoadedAtomsByEntry = getAlreadyLoadedAtomsByEntry(staticDependencyAtomsByEntry, dynamicallyDependentEntriesByAwaitedDynamicEntry, awaitedDynamicImportsByEntry, allEntries);
    // This mutates the dependentEntries in chunkAtoms
    removeUnnecessaryDependentEntries(chunkAtoms, alreadyLoadedAtomsByEntry, awaitedAlreadyLoadedAtomsByEntry);
    const { chunks, sideEffectAtoms, sizeByAtom } = getChunksWithSameDependentEntriesAndCorrelatedAtoms(chunkAtoms, staticDependencyAtomsByEntry, alreadyLoadedAtomsByEntry, minChunkSize);
    chunkDefinitions.push(...getOptimizedChunks(chunks, minChunkSize, sideEffectAtoms, sizeByAtom, log).map(({ modules }) => ({
        alias: null,
        modules
    })));
    return chunkDefinitions;
}
function getChunkDefinitionsFromManualChunks(manualChunkAliasByEntry) {
    const modulesInManualChunks = new Set(manualChunkAliasByEntry.keys());
    const manualChunkModulesByAlias = Object.create(null);
    for (const [entry, alias] of manualChunkAliasByEntry) {
        addStaticDependenciesToManualChunk(entry, (manualChunkModulesByAlias[alias] ||= []), modulesInManualChunks);
    }
    const manualChunks = Object.entries(manualChunkModulesByAlias);
    const chunkDefinitions = new Array(manualChunks.length);
    let index = 0;
    for (const [alias, modules] of manualChunks) {
        chunkDefinitions[index++] = { alias, modules };
    }
    return { chunkDefinitions, modulesInManualChunks };
}
function addStaticDependenciesToManualChunk(entry, manualChunkModules, modulesInManualChunks) {
    const modulesToHandle = new Set([entry]);
    for (const module of modulesToHandle) {
        modulesInManualChunks.add(module);
        manualChunkModules.push(module);
        for (const dependency of module.dependencies) {
            if (!(dependency instanceof ExternalModule || modulesInManualChunks.has(dependency))) {
                modulesToHandle.add(dependency);
            }
        }
    }
}
function analyzeModuleGraph(entries) {
    const dynamicEntryModules = new Set();
    const awaitedDynamicEntryModules = new Set();
    const dependentEntriesByModule = new Map();
    const allEntriesSet = new Set(entries);
    const dynamicImportModulesByEntry = new Array(allEntriesSet.size);
    const awaitedDynamicImportModulesByEntry = new Array(allEntriesSet.size);
    let entryIndex = 0;
    for (const currentEntry of allEntriesSet) {
        const dynamicImportsForCurrentEntry = new Set();
        const awaitedDynamicImportsForCurrentEntry = new Set();
        dynamicImportModulesByEntry[entryIndex] = dynamicImportsForCurrentEntry;
        awaitedDynamicImportModulesByEntry[entryIndex] = awaitedDynamicImportsForCurrentEntry;
        const staticDependencies = new Set([currentEntry]);
        for (const module of staticDependencies) {
            getOrCreate(dependentEntriesByModule, module, (getNewSet)).add(entryIndex);
            for (const dependency of module.getDependenciesToBeIncluded()) {
                if (!(dependency instanceof ExternalModule)) {
                    staticDependencies.add(dependency);
                }
            }
            for (const { resolution } of module.dynamicImports) {
                if (resolution instanceof Module &&
                    resolution.includedDynamicImporters.length > 0 &&
                    !allEntriesSet.has(resolution)) {
                    dynamicEntryModules.add(resolution);
                    allEntriesSet.add(resolution);
                    dynamicImportsForCurrentEntry.add(resolution);
                    for (const includedDirectTopLevelAwaitingDynamicImporter of resolution.includedDirectTopLevelAwaitingDynamicImporters) {
                        if (staticDependencies.has(includedDirectTopLevelAwaitingDynamicImporter)) {
                            awaitedDynamicEntryModules.add(resolution);
                            awaitedDynamicImportsForCurrentEntry.add(resolution);
                            break;
                        }
                    }
                }
            }
            for (const dependency of module.implicitlyLoadedBefore) {
                if (!allEntriesSet.has(dependency)) {
                    dynamicEntryModules.add(dependency);
                    allEntriesSet.add(dependency);
                }
            }
        }
        entryIndex++;
    }
    const allEntries = [...allEntriesSet];
    const { awaitedDynamicEntries, awaitedDynamicImportsByEntry, dynamicEntries, dynamicImportsByEntry } = getDynamicEntries(allEntries, dynamicEntryModules, dynamicImportModulesByEntry, awaitedDynamicEntryModules, awaitedDynamicImportModulesByEntry);
    return {
        allEntries,
        awaitedDynamicImportsByEntry,
        dependentEntriesByModule,
        dynamicallyDependentEntriesByAwaitedDynamicEntry: getDynamicallyDependentEntriesByDynamicEntry(dependentEntriesByModule, awaitedDynamicEntries, allEntries, dynamicEntry => dynamicEntry.includedDirectTopLevelAwaitingDynamicImporters),
        dynamicallyDependentEntriesByDynamicEntry: getDynamicallyDependentEntriesByDynamicEntry(dependentEntriesByModule, dynamicEntries, allEntries, dynamicEntry => dynamicEntry.includedDynamicImporters),
        dynamicImportsByEntry
    };
}
function getDynamicEntries(allEntries, dynamicEntryModules, dynamicImportModulesByEntry, awaitedDynamicEntryModules, awaitedDynamicImportModulesByEntry) {
    const entryIndexByModule = new Map();
    const dynamicEntries = new Set();
    const awaitedDynamicEntries = new Set();
    for (const [entryIndex, entry] of allEntries.entries()) {
        entryIndexByModule.set(entry, entryIndex);
        if (dynamicEntryModules.has(entry)) {
            dynamicEntries.add(entryIndex);
        }
        if (awaitedDynamicEntryModules.has(entry)) {
            awaitedDynamicEntries.add(entryIndex);
        }
    }
    const dynamicImportsByEntry = getDynamicImportsByEntry(dynamicImportModulesByEntry, entryIndexByModule);
    const awaitedDynamicImportsByEntry = getDynamicImportsByEntry(awaitedDynamicImportModulesByEntry, entryIndexByModule);
    return {
        awaitedDynamicEntries,
        awaitedDynamicImportsByEntry,
        dynamicEntries,
        dynamicImportsByEntry
    };
}
function getDynamicImportsByEntry(dynamicImportModulesByEntry, entryIndexByModule) {
    const dynamicImportsByEntry = new Array(dynamicImportModulesByEntry.length);
    let index = 0;
    for (const dynamicImportModules of dynamicImportModulesByEntry) {
        const dynamicImports = new Set();
        for (const dynamicEntry of dynamicImportModules) {
            dynamicImports.add(entryIndexByModule.get(dynamicEntry));
        }
        dynamicImportsByEntry[index++] = dynamicImports;
    }
    return dynamicImportsByEntry;
}
function getDynamicallyDependentEntriesByDynamicEntry(dependentEntriesByModule, dynamicEntries, allEntries, getDynamicImporters) {
    const dynamicallyDependentEntriesByDynamicEntry = new Map();
    for (const dynamicEntryIndex of dynamicEntries) {
        const dynamicallyDependentEntries = getOrCreate(dynamicallyDependentEntriesByDynamicEntry, dynamicEntryIndex, (getNewSet));
        const dynamicEntry = allEntries[dynamicEntryIndex];
        for (const importer of concatLazy([
            getDynamicImporters(dynamicEntry),
            dynamicEntry.implicitlyLoadedAfter
        ])) {
            for (const entry of dependentEntriesByModule.get(importer)) {
                dynamicallyDependentEntries.add(entry);
            }
        }
    }
    return dynamicallyDependentEntriesByDynamicEntry;
}
function getChunksWithSameDependentEntries(modulesWithDependentEntries) {
    const chunkModules = Object.create(null);
    for (const { dependentEntries, modules } of modulesWithDependentEntries) {
        let chunkSignature = 0n;
        for (const entryIndex of dependentEntries) {
            chunkSignature |= 1n << BigInt(entryIndex);
        }
        (chunkModules[String(chunkSignature)] ||= {
            dependentEntries: new Set(dependentEntries),
            modules: []
        }).modules.push(...modules);
    }
    return Object.values(chunkModules);
}
function* getModulesWithDependentEntries(dependentEntriesByModule, modulesInManualChunks) {
    for (const [module, dependentEntries] of dependentEntriesByModule) {
        if (!modulesInManualChunks.has(module)) {
            yield { dependentEntries, modules: [module] };
        }
    }
}
function getStaticDependencyAtomsByEntry(allEntries, chunkAtoms) {
    // The indices correspond to the indices in allEntries. The atoms correspond
    // to bits in the bigint values where chunk 0 is the lowest bit.
    const staticDependencyAtomsByEntry = allEntries.map(() => 0n);
    // This toggles the bits for each atom that is a dependency of an entry
    let atomMask = 1n;
    for (const { dependentEntries } of chunkAtoms) {
        for (const entryIndex of dependentEntries) {
            staticDependencyAtomsByEntry[entryIndex] |= atomMask;
        }
        atomMask <<= 1n;
    }
    return staticDependencyAtomsByEntry;
}
// Warning: This will consume dynamicallyDependentEntriesByDynamicEntry.
function getAlreadyLoadedAtomsByEntry(staticDependencyAtomsByEntry, dynamicallyDependentEntriesByDynamicEntry, dynamicImportsByEntry, allEntries) {
    // Dynamic entries have all atoms as already loaded initially because we then
    // intersect with the static dependency atoms of all dynamic importers.
    // Static entries cannot have already loaded atoms.
    const alreadyLoadedAtomsByEntry = allEntries.map((_entry, entryIndex) => dynamicallyDependentEntriesByDynamicEntry.has(entryIndex) ? -1n : 0n);
    for (const [dynamicEntryIndex, dynamicallyDependentEntries] of dynamicallyDependentEntriesByDynamicEntry) {
        // We delete here so that they can be added again if necessary to be handled
        // again by the loop
        dynamicallyDependentEntriesByDynamicEntry.delete(dynamicEntryIndex);
        const knownLoadedAtoms = alreadyLoadedAtomsByEntry[dynamicEntryIndex];
        let updatedLoadedAtoms = knownLoadedAtoms;
        for (const entryIndex of dynamicallyDependentEntries) {
            updatedLoadedAtoms &=
                staticDependencyAtomsByEntry[entryIndex] | alreadyLoadedAtomsByEntry[entryIndex];
        }
        // If the knownLoadedAtoms changed, all dependent dynamic entries need to be
        // updated again
        if (updatedLoadedAtoms !== knownLoadedAtoms) {
            alreadyLoadedAtomsByEntry[dynamicEntryIndex] = updatedLoadedAtoms;
            for (const dynamicImport of dynamicImportsByEntry[dynamicEntryIndex]) {
                // If this adds an entry that was deleted before, it will be handled
                // again. This is the reason why we delete every entry from this map
                // that we processed.
                getOrCreate(dynamicallyDependentEntriesByDynamicEntry, dynamicImport, (getNewSet)).add(dynamicEntryIndex);
            }
        }
    }
    return alreadyLoadedAtomsByEntry;
}
/**
 * This removes all unnecessary dynamic entries from the dependentEntries in its
 * first argument if a chunk is already loaded without that entry.
 */
function removeUnnecessaryDependentEntries(chunkAtoms, alreadyLoadedAtomsByEntry, awaitedAlreadyLoadedAtomsByEntry) {
    // Remove entries from dependent entries if a chunk is already loaded without
    // that entry. Do not remove already loaded atoms where all dynamic imports
    // are awaited to avoid cycles in the output.
    let chunkMask = 1n;
    for (const { dependentEntries } of chunkAtoms) {
        for (const entryIndex of dependentEntries) {
            if ((alreadyLoadedAtomsByEntry[entryIndex] & chunkMask) === chunkMask &&
                (awaitedAlreadyLoadedAtomsByEntry[entryIndex] & chunkMask) === 0n) {
                dependentEntries.delete(entryIndex);
            }
        }
        chunkMask <<= 1n;
    }
}
function getChunksWithSameDependentEntriesAndCorrelatedAtoms(chunkAtoms, staticDependencyAtomsByEntry, alreadyLoadedAtomsByEntry, minChunkSize) {
    const chunksBySignature = Object.create(null);
    const chunkByModule = new Map();
    const sizeByAtom = new Array(chunkAtoms.length);
    let sideEffectAtoms = 0n;
    let atomMask = 1n;
    let index = 0;
    for (const { dependentEntries, modules } of chunkAtoms) {
        let chunkSignature = 0n;
        let correlatedAtoms = -1n;
        for (const entryIndex of dependentEntries) {
            chunkSignature |= 1n << BigInt(entryIndex);
            // Correlated atoms are the atoms that are guaranteed to be loaded as
            // well when a given atom is loaded. It is the intersection of the already
            // loaded modules of each chunk merged with its static dependencies.
            correlatedAtoms &=
                staticDependencyAtomsByEntry[entryIndex] | alreadyLoadedAtomsByEntry[entryIndex];
        }
        const chunk = (chunksBySignature[String(chunkSignature)] ||= {
            containedAtoms: 0n,
            correlatedAtoms,
            dependencies: new Set(),
            dependentChunks: new Set(),
            dependentEntries: new Set(dependentEntries),
            modules: [],
            pure: true,
            size: 0
        });
        let atomSize = 0;
        let pure = true;
        for (const module of modules) {
            chunkByModule.set(module, chunk);
            // Unfortunately, we cannot take tree-shaking into account here because
            // rendering did not happen yet, but we can detect empty modules
            if (module.isIncluded()) {
                pure &&= !module.hasEffects();
                // we use a trivial size for the default minChunkSize to improve
                // performance
                atomSize += minChunkSize > 1 ? module.estimateSize() : 1;
            }
        }
        if (!pure) {
            sideEffectAtoms |= atomMask;
        }
        sizeByAtom[index++] = atomSize;
        chunk.containedAtoms |= atomMask;
        chunk.modules.push(...modules);
        chunk.pure &&= pure;
        chunk.size += atomSize;
        atomMask <<= 1n;
    }
    const chunks = Object.values(chunksBySignature);
    sideEffectAtoms |= addChunkDependenciesAndGetExternalSideEffectAtoms(chunks, chunkByModule, atomMask);
    return { chunks, sideEffectAtoms, sizeByAtom };
}
function addChunkDependenciesAndGetExternalSideEffectAtoms(chunks, chunkByModule, nextAvailableAtomMask) {
    const signatureByExternalModule = new Map();
    let externalSideEffectAtoms = 0n;
    for (const chunk of chunks) {
        const { dependencies, modules } = chunk;
        for (const module of modules) {
            for (const dependency of module.getDependenciesToBeIncluded()) {
                if (dependency instanceof ExternalModule) {
                    if (dependency.info.moduleSideEffects) {
                        const signature = getOrCreate(signatureByExternalModule, dependency, () => {
                            const signature = nextAvailableAtomMask;
                            nextAvailableAtomMask <<= 1n;
                            externalSideEffectAtoms |= signature;
                            return signature;
                        });
                        chunk.containedAtoms |= signature;
                        chunk.correlatedAtoms |= signature;
                    }
                }
                else {
                    const dependencyChunk = chunkByModule.get(dependency);
                    if (dependencyChunk && dependencyChunk !== chunk) {
                        dependencies.add(dependencyChunk);
                        dependencyChunk.dependentChunks.add(chunk);
                    }
                }
            }
        }
    }
    return externalSideEffectAtoms;
}
/**
 * This function tries to get rid of small chunks by merging them with other
 * chunks.
 *
 * We can only merge chunks safely if after the merge, loading any entry point
 * in any allowed order will not trigger side effects that should not have been
 * triggered. While side effects are usually things like global function calls,
 * global variable mutations or potentially thrown errors, details do not
 * matter here, and we just discern chunks without side effects (pure chunks)
 * from other chunks.
 *
 * As a first step, we assign each pre-generated chunk with side effects a
 * label. I.e. we have side effect "A" if the non-pure chunk "A" is loaded.
 *
 * Now to determine the side effects of loading a chunk, one also has to take
 * the side effects of its dependencies into account. So if A depends on B
 * (A -> B) and both have side effects, loading A triggers effects AB.
 *
 * Now from the previous step we know that each chunk is uniquely determine by
 * the entry points that depend on it and cause it to load, which we will call
 * its dependent entry points.
 *
 * E.g. if X -> A and Y -> A, then the dependent entry points of A are XY.
 * Starting from that idea, we can determine a set of chunks—and thus a set
 * of side effects—that must have been triggered if a certain chunk has been
 * loaded. Basically, it is the intersection of all chunks loaded by the
 * dependent entry points of a given chunk. We call the corresponding side
 * effects the correlated side effects of that chunk.
 *
 * Example:
 * X -> ABC, Y -> ADE, A-> F, B -> D
 * Then taking dependencies into account, X -> ABCDF, Y -> ADEF
 * The intersection is ADF. So we know that when A is loaded, D and F must also
 * be in memory even though neither D nor A is a dependency of the other.
 * If all have side effects, we call ADF the correlated side effects of A. The
 * correlated side effects need to remain constant when merging chunks.
 *
 * In contrast, we have the dependency side effects of A, which represents
 * the side effects we trigger if we directly load A. In this example, the
 * dependency side effects are AF.
 * For entry chunks, dependency and correlated side effects are the same.
 *
 * With these concepts, merging chunks is allowed if the correlated side
 * effects of each entry do not change. Thus, we are allowed to merge two
 * chunks if
 *
 * a) the dependency side effects of each chunk are a subset of the correlated
 *    side effects of the other chunk, so no additional side effects are
 *    triggered for any entry, or
 * b) The dependent entry points of chunk A are a subset of the dependent entry
 *    points of chunk B while the dependency side effects of A are a subset of
 *    the correlated side effects of B. Because in that scenario, whenever A is
 *    loaded, B is loaded as well. But there are cases when B is loaded where A
 *    is not loaded. So if we merge the chunks, all dependency side effects of
 *    A will be added to the correlated side effects of B, and as the latter is
 *    not allowed to change, the former need to be a subset of the latter.
 *
 * Another consideration when merging small chunks into other chunks is to
 * avoid
 * that too much additional code is loaded. This is achieved when the dependent
 * entries of the small chunk are a subset of the dependent entries of the
 * other
 * chunk. Because then when the small chunk is loaded, the other chunk was
 * loaded/in memory anyway, so at most when the other chunk is loaded, the
 * additional size of the small chunk is loaded unnecessarily.
 *
 * So the algorithm performs merges in two passes:
 *
 * 1. First we try to merge small chunks A only into other chunks B if the
 *    dependent entries of A are a subset of the dependent entries of B and the
 *    dependency side effects of A are a subset of the correlated side effects
 *    of B.
 * 2. Only then for all remaining small chunks, we look for arbitrary merges
 *    following the rule (a), starting with the smallest chunks to look for
 *    possible merge targets.
 */
function getOptimizedChunks(chunks, minChunkSize, sideEffectAtoms, sizeByAtom, log) {
    timeStart('optimize chunks', 3);
    const chunkPartition = getPartitionedChunks(chunks, minChunkSize);
    if (!chunkPartition) {
        timeEnd('optimize chunks', 3);
        return chunks; // the actual modules
    }
    if (minChunkSize > 1) {
        log('info', logOptimizeChunkStatus(chunks.length, chunkPartition.small.size, 'Initially'));
    }
    mergeChunks(chunkPartition, minChunkSize, sideEffectAtoms, sizeByAtom);
    if (minChunkSize > 1) {
        log('info', logOptimizeChunkStatus(chunkPartition.small.size + chunkPartition.big.size, chunkPartition.small.size, 'After merging chunks'));
    }
    timeEnd('optimize chunks', 3);
    return [...chunkPartition.small, ...chunkPartition.big];
}
function getPartitionedChunks(chunks, minChunkSize) {
    const smallChunks = [];
    const bigChunks = [];
    for (const chunk of chunks) {
        (chunk.size < minChunkSize ? smallChunks : bigChunks).push(chunk);
    }
    if (smallChunks.length === 0) {
        return null;
    }
    smallChunks.sort(compareChunkSize);
    bigChunks.sort(compareChunkSize);
    return {
        big: new Set(bigChunks),
        small: new Set(smallChunks)
    };
}
function compareChunkSize({ size: sizeA }, { size: sizeB }) {
    return sizeA - sizeB;
}
function mergeChunks(chunkPartition, minChunkSize, sideEffectAtoms, sizeByAtom) {
    const { small } = chunkPartition;
    for (const mergedChunk of small) {
        const bestTargetChunk = findBestMergeTarget(mergedChunk, chunkPartition, sideEffectAtoms, sizeByAtom, 
        // In the default case, we do not accept size increases
        minChunkSize <= 1 ? 1 : Infinity);
        if (bestTargetChunk) {
            const { containedAtoms, correlatedAtoms, modules, pure, size } = mergedChunk;
            small.delete(mergedChunk);
            getChunksInPartition(bestTargetChunk, minChunkSize, chunkPartition).delete(bestTargetChunk);
            bestTargetChunk.modules.push(...modules);
            bestTargetChunk.size += size;
            bestTargetChunk.pure &&= pure;
            const { dependencies, dependentChunks, dependentEntries } = bestTargetChunk;
            bestTargetChunk.correlatedAtoms &= correlatedAtoms;
            bestTargetChunk.containedAtoms |= containedAtoms;
            for (const entry of mergedChunk.dependentEntries) {
                dependentEntries.add(entry);
            }
            for (const dependency of mergedChunk.dependencies) {
                dependencies.add(dependency);
                dependency.dependentChunks.delete(mergedChunk);
                dependency.dependentChunks.add(bestTargetChunk);
            }
            for (const dependentChunk of mergedChunk.dependentChunks) {
                dependentChunks.add(dependentChunk);
                dependentChunk.dependencies.delete(mergedChunk);
                dependentChunk.dependencies.add(bestTargetChunk);
            }
            dependencies.delete(bestTargetChunk);
            dependentChunks.delete(bestTargetChunk);
            getChunksInPartition(bestTargetChunk, minChunkSize, chunkPartition).add(bestTargetChunk);
        }
    }
}
function findBestMergeTarget(mergedChunk, { big, small }, sideEffectAtoms, sizeByAtom, smallestAdditionalSize) {
    let bestTargetChunk = null;
    // In the default case, we do not accept size increases
    for (const targetChunk of concatLazy([small, big])) {
        if (mergedChunk === targetChunk)
            continue;
        const additionalSizeAfterMerge = getAdditionalSizeAfterMerge(mergedChunk, targetChunk, smallestAdditionalSize, sideEffectAtoms, sizeByAtom);
        if (additionalSizeAfterMerge < smallestAdditionalSize) {
            bestTargetChunk = targetChunk;
            if (additionalSizeAfterMerge === 0)
                break;
            smallestAdditionalSize = additionalSizeAfterMerge;
        }
    }
    return bestTargetChunk;
}
/**
 * Determine the additional unused code size that would be added by merging the
 * two chunks. This is not an exact measurement but rather an upper bound. If
 * the merge produces cycles or adds non-correlated side effects, `Infinity`
 * is returned.
 * Merging will not produce cycles if none of the direct non-merged
 * dependencies of a chunk have the other chunk as a transitive dependency.
 */
function getAdditionalSizeAfterMerge(mergedChunk, targetChunk, 
// The maximum additional unused code size allowed to be added by the merge,
// taking dependencies into account, needs to be below this number
currentAdditionalSize, sideEffectAtoms, sizeByAtom) {
    const firstSize = getAdditionalSizeIfNoTransitiveDependencyOrNonCorrelatedSideEffect(mergedChunk, targetChunk, currentAdditionalSize, sideEffectAtoms, sizeByAtom);
    return firstSize < currentAdditionalSize
        ? firstSize +
            getAdditionalSizeIfNoTransitiveDependencyOrNonCorrelatedSideEffect(targetChunk, mergedChunk, currentAdditionalSize - firstSize, sideEffectAtoms, sizeByAtom)
        : Infinity;
}
function getAdditionalSizeIfNoTransitiveDependencyOrNonCorrelatedSideEffect(dependentChunk, dependencyChunk, currentAdditionalSize, sideEffectAtoms, sizeByAtom) {
    const { correlatedAtoms } = dependencyChunk;
    let dependencyAtoms = dependentChunk.containedAtoms;
    const dependentContainedSideEffects = dependencyAtoms & sideEffectAtoms;
    if ((correlatedAtoms & dependentContainedSideEffects) !== dependentContainedSideEffects) {
        return Infinity;
    }
    const chunksToCheck = new Set(dependentChunk.dependencies);
    for (const { dependencies, containedAtoms } of chunksToCheck) {
        dependencyAtoms |= containedAtoms;
        const containedSideEffects = containedAtoms & sideEffectAtoms;
        if ((correlatedAtoms & containedSideEffects) !== containedSideEffects) {
            return Infinity;
        }
        for (const dependency of dependencies) {
            if (dependency === dependencyChunk) {
                return Infinity;
            }
            chunksToCheck.add(dependency);
        }
    }
    return getAtomsSizeIfBelowLimit(dependencyAtoms & ~correlatedAtoms, currentAdditionalSize, sizeByAtom);
}
function getAtomsSizeIfBelowLimit(atoms, currentAdditionalSize, sizeByAtom) {
    let size = 0;
    let atomIndex = 0;
    let atomSignature = 1n;
    const { length } = sizeByAtom;
    for (; atomIndex < length; atomIndex++) {
        if ((atoms & atomSignature) === atomSignature) {
            size += sizeByAtom[atomIndex];
        }
        atomSignature <<= 1n;
        if (size >= currentAdditionalSize) {
            return Infinity;
        }
    }
    return size;
}
function getChunksInPartition(chunk, minChunkSize, chunkPartition) {
    return chunk.size < minChunkSize ? chunkPartition.small : chunkPartition.big;
}
