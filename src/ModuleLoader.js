import ExternalModule from './ExternalModule';
import Module from './Module';
import { EMPTY_OBJECT } from './utils/blank';
import { LOGLEVEL_WARN } from './utils/logging';
import { error, logBadLoader, logEntryCannotBeExternal, logExternalModulesCannotBeIncludedInManualChunks, logExternalModulesCannotBeTransformedToModules, logExternalSyntheticExports, logImplicitDependantCannotBeExternal, logInconsistentImportAttributes, logInternalIdCannotBeExternal, logUnresolvedEntry, logUnresolvedImplicitDependant, logUnresolvedImport, logUnresolvedImportTreatedAsExternal } from './utils/logs';
import { doAttributesDiffer, getAttributesFromImportExpression } from './utils/parseImportAttributes';
import { isAbsolute, isRelative, resolve } from './utils/path';
import relativeId from './utils/relativeId';
import { resolveId } from './utils/resolveId';
import stripBom from './utils/stripBom';
import transform from './utils/transform';
const RESOLVE_DEPENDENCIES = 'resolveDependencies';
export class ModuleLoader {
    constructor(graph, modulesById, options, pluginDriver) {
        this.graph = graph;
        this.modulesById = modulesById;
        this.options = options;
        this.pluginDriver = pluginDriver;
        this.implicitEntryModules = new Set();
        this.indexedEntryModules = [];
        this.latestLoadModulesPromise = Promise.resolve();
        this.moduleLoadPromises = new Map();
        this.modulesWithLoadedDependencies = new Set();
        this.nextChunkNamePriority = 0;
        this.nextEntryModuleIndex = 0;
        this.resolveId = async (source, importer, customOptions, isEntry, attributes, skip = null) => this.getResolvedIdWithDefaults(this.getNormalizedResolvedIdWithoutDefaults(this.options.external(source, importer, false)
            ? false
            : await resolveId(source, importer, this.options.preserveSymlinks, this.pluginDriver, this.resolveId, skip, customOptions, typeof isEntry === 'boolean' ? isEntry : !importer, attributes, this.options.fs), importer, source), attributes);
        this.hasModuleSideEffects = options.treeshake
            ? options.treeshake.moduleSideEffects
            : () => true;
    }
    async addAdditionalModules(unresolvedModules, isAddForManualChunks) {
        const result = this.extendLoadModulesPromise(Promise.all(unresolvedModules.map(id => this.loadEntryModule(id, false, undefined, null, isAddForManualChunks))));
        await this.awaitLoadModulesPromise();
        return result;
    }
    async addEntryModules(unresolvedEntryModules, isUserDefined) {
        const firstEntryModuleIndex = this.nextEntryModuleIndex;
        this.nextEntryModuleIndex += unresolvedEntryModules.length;
        const firstChunkNamePriority = this.nextChunkNamePriority;
        this.nextChunkNamePriority += unresolvedEntryModules.length;
        const newEntryModules = await this.extendLoadModulesPromise(Promise.all(unresolvedEntryModules.map(({ id, importer }) => this.loadEntryModule(id, true, importer, null))).then(entryModules => {
            for (const [index, entryModule] of entryModules.entries()) {
                entryModule.isUserDefinedEntryPoint =
                    entryModule.isUserDefinedEntryPoint || isUserDefined;
                addChunkNamesToModule(entryModule, unresolvedEntryModules[index], isUserDefined, firstChunkNamePriority + index);
                const existingIndexedModule = this.indexedEntryModules.find(indexedModule => indexedModule.module === entryModule);
                if (existingIndexedModule) {
                    existingIndexedModule.index = Math.min(existingIndexedModule.index, firstEntryModuleIndex + index);
                }
                else {
                    this.indexedEntryModules.push({
                        index: firstEntryModuleIndex + index,
                        module: entryModule
                    });
                }
            }
            this.indexedEntryModules.sort(({ index: indexA }, { index: indexB }) => indexA > indexB ? 1 : -1);
            return entryModules;
        }));
        await this.awaitLoadModulesPromise();
        return {
            entryModules: this.indexedEntryModules.map(({ module }) => module),
            implicitEntryModules: [...this.implicitEntryModules],
            newEntryModules
        };
    }
    async emitChunk({ fileName, id, importer, name, implicitlyLoadedAfterOneOf, preserveSignature }) {
        const unresolvedModule = {
            fileName: fileName || null,
            id,
            importer,
            name: name || null
        };
        const module = implicitlyLoadedAfterOneOf
            ? await this.addEntryWithImplicitDependants(unresolvedModule, implicitlyLoadedAfterOneOf)
            : (await this.addEntryModules([unresolvedModule], false)).newEntryModules[0];
        if (preserveSignature != null) {
            module.preserveSignature = preserveSignature;
        }
        return module;
    }
    async preloadModule(resolvedId) {
        const module = await this.fetchModule(this.getResolvedIdWithDefaults(resolvedId, EMPTY_OBJECT), undefined, false, resolvedId.resolveDependencies ? RESOLVE_DEPENDENCIES : true);
        return module.info;
    }
    addEntryWithImplicitDependants(unresolvedModule, implicitlyLoadedAfter) {
        const chunkNamePriority = this.nextChunkNamePriority++;
        return this.extendLoadModulesPromise(this.loadEntryModule(unresolvedModule.id, false, unresolvedModule.importer, null).then(async (entryModule) => {
            addChunkNamesToModule(entryModule, unresolvedModule, false, chunkNamePriority);
            if (!entryModule.info.isEntry) {
                const implicitlyLoadedAfterModules = await Promise.all(implicitlyLoadedAfter.map(id => this.loadEntryModule(id, false, unresolvedModule.importer, entryModule.id)));
                // We need to check again if this is still an entry module as these
                // changes need to be performed atomically to avoid race conditions
                // if the same module is re-emitted as an entry module.
                // The inverse changes happen in "handleExistingModule"
                if (!entryModule.info.isEntry) {
                    this.implicitEntryModules.add(entryModule);
                    for (const module of implicitlyLoadedAfterModules) {
                        entryModule.implicitlyLoadedAfter.add(module);
                    }
                    for (const dependant of entryModule.implicitlyLoadedAfter) {
                        dependant.implicitlyLoadedBefore.add(entryModule);
                    }
                }
            }
            return entryModule;
        }));
    }
    async addModuleSource(id, importer, module) {
        let source;
        try {
            source = await this.graph.fileOperationQueue.run(async () => {
                const content = await this.pluginDriver.hookFirst('load', [id]);
                if (content !== null)
                    return content;
                this.graph.watchFiles[id] = true;
                return (await this.options.fs.readFile(id, { encoding: 'utf8' }));
            });
        }
        catch (error_) {
            let message = `Could not load ${id}`;
            if (importer)
                message += ` (imported by ${relativeId(importer)})`;
            message += `: ${error_.message}`;
            error_.message = message;
            throw error_;
        }
        const sourceDescription = typeof source === 'string'
            ? { code: source }
            : source != null && typeof source === 'object' && typeof source.code === 'string'
                ? source
                : error(logBadLoader(id));
        sourceDescription.code = stripBom(sourceDescription.code);
        const cachedModule = this.graph.cachedModules.get(id);
        if (cachedModule &&
            !cachedModule.customTransformCache &&
            cachedModule.originalCode === sourceDescription.code &&
            !(await this.pluginDriver.hookFirst('shouldTransformCachedModule', [
                {
                    ast: cachedModule.ast,
                    code: cachedModule.code,
                    id: cachedModule.id,
                    meta: cachedModule.meta,
                    moduleSideEffects: cachedModule.moduleSideEffects,
                    resolvedSources: cachedModule.resolvedIds,
                    syntheticNamedExports: cachedModule.syntheticNamedExports
                }
            ]))) {
            if (cachedModule.transformFiles) {
                for (const emittedFile of cachedModule.transformFiles)
                    this.pluginDriver.emitFile(emittedFile);
            }
            await module.setSource(cachedModule);
        }
        else {
            module.updateOptions(sourceDescription);
            await module.setSource(await transform(sourceDescription, module, this.pluginDriver, this.options.onLog));
        }
    }
    async awaitLoadModulesPromise() {
        let startingPromise;
        do {
            startingPromise = this.latestLoadModulesPromise;
            await startingPromise;
        } while (startingPromise !== this.latestLoadModulesPromise);
    }
    extendLoadModulesPromise(loadNewModulesPromise) {
        this.latestLoadModulesPromise = Promise.all([
            loadNewModulesPromise,
            this.latestLoadModulesPromise
        ]);
        this.latestLoadModulesPromise.catch(() => {
            /* Avoid unhandled Promise rejections */
        });
        return loadNewModulesPromise;
    }
    async fetchDynamicDependencies(module, resolveDynamicImportPromises) {
        const dependencies = await Promise.all(resolveDynamicImportPromises.map(resolveDynamicImportPromise => resolveDynamicImportPromise.then(async ([dynamicImport, resolvedId]) => {
            if (resolvedId === null)
                return null;
            if (typeof resolvedId === 'string') {
                dynamicImport.resolution = resolvedId;
                return null;
            }
            return (dynamicImport.resolution = await this.fetchResolvedDependency(relativeId(resolvedId.id), module.id, resolvedId));
        })));
        for (const dependency of dependencies) {
            if (dependency) {
                module.dynamicDependencies.add(dependency);
                dependency.dynamicImporters.push(module.id);
            }
        }
    }
    // If this is a preload, then this method always waits for the dependencies of
    // the module to be resolved.
    // Otherwise, if the module does not exist, it waits for the module and all
    // its dependencies to be loaded.
    // Otherwise, it returns immediately.
    async fetchModule({ attributes, id, meta, moduleSideEffects, syntheticNamedExports }, importer, isEntry, isPreload) {
        const existingModule = this.modulesById.get(id);
        if (existingModule instanceof Module) {
            if (importer && doAttributesDiffer(attributes, existingModule.info.attributes)) {
                this.options.onLog(LOGLEVEL_WARN, logInconsistentImportAttributes(existingModule.info.attributes, attributes, id, importer));
            }
            await this.handleExistingModule(existingModule, isEntry, isPreload);
            return existingModule;
        }
        if (existingModule instanceof ExternalModule) {
            return error(logExternalModulesCannotBeTransformedToModules(existingModule.id));
        }
        const module = new Module(this.graph, id, this.options, isEntry, moduleSideEffects, syntheticNamedExports, meta, attributes);
        this.modulesById.set(id, module);
        const loadPromise = this.addModuleSource(id, importer, module).then(() => [
            this.getResolveStaticDependencyPromises(module),
            this.getResolveDynamicImportPromises(module),
            loadAndResolveDependenciesPromise
        ]);
        const loadAndResolveDependenciesPromise = waitForDependencyResolution(loadPromise).then(() => this.pluginDriver.hookParallel('moduleParsed', [module.info]));
        loadAndResolveDependenciesPromise.catch(() => {
            /* avoid unhandled promise rejections */
        });
        this.moduleLoadPromises.set(module, loadPromise);
        const resolveDependencyPromises = await loadPromise;
        if (!isPreload) {
            await this.fetchModuleDependencies(module, ...resolveDependencyPromises);
        }
        else if (isPreload === RESOLVE_DEPENDENCIES) {
            await loadAndResolveDependenciesPromise;
        }
        return module;
    }
    async fetchModuleDependencies(module, resolveStaticDependencyPromises, resolveDynamicDependencyPromises, loadAndResolveDependenciesPromise) {
        if (this.modulesWithLoadedDependencies.has(module)) {
            return;
        }
        this.modulesWithLoadedDependencies.add(module);
        await Promise.all([
            this.fetchStaticDependencies(module, resolveStaticDependencyPromises),
            this.fetchDynamicDependencies(module, resolveDynamicDependencyPromises)
        ]);
        module.linkImports();
        // To handle errors when resolving dependencies or in moduleParsed
        await loadAndResolveDependenciesPromise;
    }
    fetchResolvedDependency(source, importer, resolvedId) {
        if (resolvedId.external) {
            const { attributes, external, id, moduleSideEffects, meta } = resolvedId;
            let externalModule = this.modulesById.get(id);
            if (!externalModule) {
                externalModule = new ExternalModule(this.options, id, moduleSideEffects, meta, external !== 'absolute' && isAbsolute(id), attributes);
                this.modulesById.set(id, externalModule);
            }
            else if (!(externalModule instanceof ExternalModule)) {
                return error(logInternalIdCannotBeExternal(source, importer));
            }
            else if (doAttributesDiffer(externalModule.info.attributes, attributes)) {
                this.options.onLog(LOGLEVEL_WARN, logInconsistentImportAttributes(externalModule.info.attributes, attributes, source, importer));
            }
            return Promise.resolve(externalModule);
        }
        return this.fetchModule(resolvedId, importer, false, false);
    }
    async fetchStaticDependencies(module, resolveStaticDependencyPromises) {
        for (const dependency of await Promise.all(resolveStaticDependencyPromises.map(resolveStaticDependencyPromise => resolveStaticDependencyPromise.then(([source, resolvedId]) => this.fetchResolvedDependency(source, module.id, resolvedId))))) {
            module.dependencies.add(dependency);
            dependency.importers.push(module.id);
        }
        if (!this.options.treeshake || module.info.moduleSideEffects === 'no-treeshake') {
            for (const dependency of module.dependencies) {
                if (dependency instanceof Module) {
                    dependency.importedFromNotTreeshaken = true;
                }
            }
        }
    }
    getNormalizedResolvedIdWithoutDefaults(resolveIdResult, importer, source) {
        const { makeAbsoluteExternalsRelative } = this.options;
        if (resolveIdResult) {
            if (typeof resolveIdResult === 'object') {
                const external = resolveIdResult.external || this.options.external(resolveIdResult.id, importer, true);
                return {
                    ...resolveIdResult,
                    external: external &&
                        (external === 'relative' ||
                            !isAbsolute(resolveIdResult.id) ||
                            (external === true &&
                                isNotAbsoluteExternal(resolveIdResult.id, source, makeAbsoluteExternalsRelative)) ||
                            'absolute')
                };
            }
            const external = this.options.external(resolveIdResult, importer, true);
            return {
                external: external &&
                    (isNotAbsoluteExternal(resolveIdResult, source, makeAbsoluteExternalsRelative) ||
                        'absolute'),
                id: external && makeAbsoluteExternalsRelative
                    ? normalizeRelativeExternalId(resolveIdResult, importer)
                    : resolveIdResult
            };
        }
        const id = makeAbsoluteExternalsRelative
            ? normalizeRelativeExternalId(source, importer)
            : source;
        if (resolveIdResult !== false && !this.options.external(id, importer, true)) {
            return null;
        }
        return {
            external: isNotAbsoluteExternal(id, source, makeAbsoluteExternalsRelative) || 'absolute',
            id
        };
    }
    getResolveDynamicImportPromises(module) {
        return module.dynamicImports.map(async (dynamicImport) => {
            const resolvedId = await this.resolveDynamicImport(module, dynamicImport.argument, module.id, getAttributesFromImportExpression(dynamicImport.node));
            if (resolvedId && typeof resolvedId === 'object') {
                dynamicImport.id = resolvedId.id;
            }
            return [dynamicImport, resolvedId];
        });
    }
    getResolveStaticDependencyPromises(module) {
        return Array.from(module.sourcesWithAttributes, async ([source, attributes]) => [
            source,
            (module.resolvedIds[source] =
                module.resolvedIds[source] ||
                    this.handleInvalidResolvedId(await this.resolveId(source, module.id, EMPTY_OBJECT, false, attributes), source, module.id, attributes))
        ]);
    }
    getResolvedIdWithDefaults(resolvedId, attributes) {
        if (!resolvedId) {
            return null;
        }
        const external = resolvedId.external || false;
        return {
            attributes: resolvedId.attributes || attributes,
            external,
            id: resolvedId.id,
            meta: resolvedId.meta || {},
            moduleSideEffects: resolvedId.moduleSideEffects ?? this.hasModuleSideEffects(resolvedId.id, !!external),
            resolvedBy: resolvedId.resolvedBy ?? 'rollup',
            syntheticNamedExports: resolvedId.syntheticNamedExports ?? false
        };
    }
    async handleExistingModule(module, isEntry, isPreload) {
        const loadPromise = this.moduleLoadPromises.get(module);
        if (isPreload) {
            return isPreload === RESOLVE_DEPENDENCIES
                ? waitForDependencyResolution(loadPromise)
                : loadPromise;
        }
        if (isEntry) {
            // This reverts the changes in addEntryWithImplicitDependants and needs to
            // be performed atomically
            module.info.isEntry = true;
            this.implicitEntryModules.delete(module);
            for (const dependant of module.implicitlyLoadedAfter) {
                dependant.implicitlyLoadedBefore.delete(module);
            }
            module.implicitlyLoadedAfter.clear();
        }
        return this.fetchModuleDependencies(module, ...(await loadPromise));
    }
    handleInvalidResolvedId(resolvedId, source, importer, attributes) {
        if (resolvedId === null) {
            if (isRelative(source)) {
                return error(logUnresolvedImport(source, importer));
            }
            this.options.onLog(LOGLEVEL_WARN, logUnresolvedImportTreatedAsExternal(source, importer));
            return {
                attributes,
                external: true,
                id: source,
                meta: {},
                moduleSideEffects: this.hasModuleSideEffects(source, true),
                resolvedBy: 'rollup',
                syntheticNamedExports: false
            };
        }
        else if (resolvedId.external && resolvedId.syntheticNamedExports) {
            this.options.onLog(LOGLEVEL_WARN, logExternalSyntheticExports(source, importer));
        }
        return resolvedId;
    }
    async loadEntryModule(unresolvedId, isEntry, importer, implicitlyLoadedBefore, isLoadForManualChunks = false) {
        const resolveIdResult = await resolveId(unresolvedId, importer, this.options.preserveSymlinks, this.pluginDriver, this.resolveId, null, EMPTY_OBJECT, true, EMPTY_OBJECT, this.options.fs);
        if (resolveIdResult == null) {
            return error(implicitlyLoadedBefore === null
                ? logUnresolvedEntry(unresolvedId)
                : logUnresolvedImplicitDependant(unresolvedId, implicitlyLoadedBefore));
        }
        const isExternalModules = typeof resolveIdResult === 'object' && resolveIdResult.external;
        if (resolveIdResult === false || isExternalModules) {
            return error(implicitlyLoadedBefore === null
                ? isExternalModules && isLoadForManualChunks
                    ? logExternalModulesCannotBeIncludedInManualChunks(unresolvedId)
                    : logEntryCannotBeExternal(unresolvedId)
                : logImplicitDependantCannotBeExternal(unresolvedId, implicitlyLoadedBefore));
        }
        return this.fetchModule(this.getResolvedIdWithDefaults(typeof resolveIdResult === 'object'
            ? resolveIdResult
            : { id: resolveIdResult }, EMPTY_OBJECT), undefined, isEntry, false);
    }
    async resolveDynamicImport(module, specifier, importer, attributes) {
        const resolution = await this.pluginDriver.hookFirst('resolveDynamicImport', [
            specifier,
            importer,
            { attributes }
        ]);
        if (typeof specifier !== 'string') {
            if (typeof resolution === 'string') {
                return resolution;
            }
            if (!resolution) {
                return null;
            }
            return this.getResolvedIdWithDefaults(resolution, attributes);
        }
        if (resolution == null) {
            const existingResolution = module.resolvedIds[specifier];
            if (existingResolution) {
                if (doAttributesDiffer(existingResolution.attributes, attributes)) {
                    this.options.onLog(LOGLEVEL_WARN, logInconsistentImportAttributes(existingResolution.attributes, attributes, specifier, importer));
                }
                return existingResolution;
            }
            return (module.resolvedIds[specifier] = this.handleInvalidResolvedId(await this.resolveId(specifier, module.id, EMPTY_OBJECT, false, attributes), specifier, module.id, attributes));
        }
        return this.handleInvalidResolvedId(this.getResolvedIdWithDefaults(this.getNormalizedResolvedIdWithoutDefaults(resolution, importer, specifier), attributes), specifier, importer, attributes);
    }
}
function normalizeRelativeExternalId(source, importer) {
    return isRelative(source)
        ? importer
            ? resolve(importer, '..', source)
            : resolve(source)
        : source;
}
function addChunkNamesToModule(module, { fileName, name }, isUserDefined, priority) {
    if (fileName !== null) {
        module.chunkFileNames.add(fileName);
    }
    else if (name !== null) {
        // Always keep chunkNames sorted by priority
        let namePosition = 0;
        while (module.chunkNames[namePosition]?.priority < priority)
            namePosition++;
        module.chunkNames.splice(namePosition, 0, { isUserDefined, name, priority });
    }
}
function isNotAbsoluteExternal(id, source, makeAbsoluteExternalsRelative) {
    return (makeAbsoluteExternalsRelative === true ||
        (makeAbsoluteExternalsRelative === 'ifRelativeSource' && isRelative(source)) ||
        !isAbsolute(id));
}
async function waitForDependencyResolution(loadPromise) {
    const [resolveStaticDependencyPromises, resolveDynamicImportPromises] = await loadPromise;
    return Promise.all([...resolveStaticDependencyPromises, ...resolveDynamicImportPromises]);
}
