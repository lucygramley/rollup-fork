import { extractAssignedNames } from '@rollup/pluginutils';
import { locate } from 'locate-character';
import MagicString from 'magic-string';
import { parseAsync } from '../native';
import { convertProgram } from './ast/bufferParsers';
import { createInclusionContext } from './ast/ExecutionContext';
import { nodeConstructors } from './ast/nodes';
import ExportAllDeclaration from './ast/nodes/ExportAllDeclaration';
import ExportDefaultDeclaration from './ast/nodes/ExportDefaultDeclaration';
import Identifier from './ast/nodes/Identifier';
import ImportDefaultSpecifier from './ast/nodes/ImportDefaultSpecifier';
import ImportNamespaceSpecifier from './ast/nodes/ImportNamespaceSpecifier';
import Literal from './ast/nodes/Literal';
import * as NodeType from './ast/nodes/NodeType';
import VariableDeclaration from './ast/nodes/VariableDeclaration';
import ModuleScope from './ast/scopes/ModuleScope';
import { UNKNOWN_PATH } from './ast/utils/PathTracker';
import ExportDefaultVariable from './ast/variables/ExportDefaultVariable';
import ExportShimVariable from './ast/variables/ExportShimVariable';
import ExternalVariable from './ast/variables/ExternalVariable';
import NamespaceVariable from './ast/variables/NamespaceVariable';
import SyntheticNamedExportVariable from './ast/variables/SyntheticNamedExportVariable';
import ExternalModule from './ExternalModule';
import { EMPTY_OBJECT } from './utils/blank';
import { BuildPhase } from './utils/buildPhase';
import { decodedSourcemap, resetSourcemapCache } from './utils/decodedSourcemap';
import { getId } from './utils/getId';
import { getNewSet, getOrCreate } from './utils/getOrCreate';
import { getOriginalLocation } from './utils/getOriginalLocation';
import { cacheObjectGetters } from './utils/getter';
import { makeLegal } from './utils/identifierHelpers';
import { LOGLEVEL_WARN } from './utils/logging';
import { augmentCodeLocation, error, logAmbiguousExternalNamespaces, logCircularReexport, logDuplicateExportError, logInconsistentImportAttributes, logInvalidFormatForTopLevelAwait, logInvalidSourcemapForError, logMissingEntryExport, logMissingExport, logMissingJsxExport, logModuleParseError, logNamespaceConflict, logRedeclarationError, logShimmedExport, logSyntheticNamedExportsNeedNamespaceExport } from './utils/logs';
import { parseAst } from './utils/parseAst';
import { doAttributesDiffer, getAttributesFromImportExportDeclaration } from './utils/parseImportAttributes';
import { basename, extname } from './utils/path';
import { timeEnd, timeStart } from './utils/timers';
import { markModuleAndImpureDependenciesAsExecuted } from './utils/traverseStaticDependencies';
import { MISSING_EXPORT_SHIM_VARIABLE } from './utils/variableNames';
const MISSING_EXPORT_SHIM_DESCRIPTION = {
    identifier: null,
    localName: MISSING_EXPORT_SHIM_VARIABLE
};
function getVariableForExportNameRecursive(target, name, importerForSideEffects, isExportAllSearch, searchedNamesAndModules = new Map()) {
    const searchedModules = searchedNamesAndModules.get(name);
    if (searchedModules) {
        if (searchedModules.has(target)) {
            return isExportAllSearch ? [null] : error(logCircularReexport(name, target.id));
        }
        searchedModules.add(target);
    }
    else {
        searchedNamesAndModules.set(name, new Set([target]));
    }
    return target.getVariableForExportName(name, {
        importerForSideEffects,
        isExportAllSearch,
        searchedNamesAndModules
    });
}
function getAndExtendSideEffectModules(variable, module) {
    const sideEffectModules = getOrCreate(module.sideEffectDependenciesByVariable, variable, (getNewSet));
    let currentVariable = variable;
    const referencedVariables = new Set([currentVariable]);
    while (true) {
        const importingModule = currentVariable.module;
        currentVariable =
            currentVariable instanceof ExportDefaultVariable
                ? currentVariable.getDirectOriginalVariable()
                : currentVariable instanceof SyntheticNamedExportVariable
                    ? currentVariable.syntheticNamespace
                    : null;
        if (!currentVariable || referencedVariables.has(currentVariable)) {
            break;
        }
        referencedVariables.add(currentVariable);
        sideEffectModules.add(importingModule);
        const originalSideEffects = importingModule.sideEffectDependenciesByVariable.get(currentVariable);
        if (originalSideEffects) {
            for (const module of originalSideEffects) {
                sideEffectModules.add(module);
            }
        }
    }
    return sideEffectModules;
}
export default class Module {
    constructor(graph, id, options, isEntry, moduleSideEffects, syntheticNamedExports, meta, attributes) {
        this.graph = graph;
        this.id = id;
        this.options = options;
        this.alternativeReexportModules = new Map();
        this.chunkFileNames = new Set();
        this.chunkNames = [];
        this.cycles = new Set();
        this.dependencies = new Set();
        this.dynamicDependencies = new Set();
        this.dynamicImporters = [];
        this.dynamicImports = [];
        this.execIndex = Infinity;
        this.hasTreeShakingPassStarted = false;
        this.implicitlyLoadedAfter = new Set();
        this.implicitlyLoadedBefore = new Set();
        this.importDescriptions = new Map();
        this.importMetas = [];
        this.importedFromNotTreeshaken = false;
        this.importers = [];
        this.includedDynamicImporters = [];
        this.includedDirectTopLevelAwaitingDynamicImporters = new Set();
        this.includedImports = new Set();
        this.isExecuted = false;
        this.isUserDefinedEntryPoint = false;
        this.needsExportShim = false;
        this.sideEffectDependenciesByVariable = new Map();
        this.sourcesWithAttributes = new Map();
        this.allExportNames = null;
        this.allExportsIncluded = false;
        this.ast = null;
        this.exportAllModules = [];
        this.exportAllSources = new Set();
        this.exportNamesByVariable = null;
        this.exportShimVariable = new ExportShimVariable(this);
        this.exports = new Map();
        this.namespaceReexportsByName = new Map();
        this.reexportDescriptions = new Map();
        this.relevantDependencies = null;
        this.syntheticExports = new Map();
        this.syntheticNamespace = null;
        this.transformDependencies = [];
        this.transitiveReexports = null;
        this.excludeFromSourcemap = /\0/.test(id);
        this.context = options.moduleContext(id);
        this.preserveSignature = this.options.preserveEntrySignatures;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const module = this;
        const { dynamicImports, dynamicImporters, exportAllSources, exports, implicitlyLoadedAfter, implicitlyLoadedBefore, importers, reexportDescriptions, sourcesWithAttributes } = this;
        this.info = {
            ast: null,
            attributes,
            code: null,
            get dynamicallyImportedIdResolutions() {
                return dynamicImports
                    .map(({ argument }) => typeof argument === 'string' && module.resolvedIds[argument])
                    .filter(Boolean);
            },
            get dynamicallyImportedIds() {
                // We cannot use this.dynamicDependencies because this is needed before
                // dynamicDependencies are populated
                return dynamicImports.map(({ id }) => id).filter((id) => id != null);
            },
            get dynamicImporters() {
                return dynamicImporters.sort();
            },
            get exportedBindings() {
                const exportBindings = { '.': [...exports.keys()] };
                for (const [name, { source }] of reexportDescriptions) {
                    (exportBindings[source] ??= []).push(name);
                }
                for (const source of exportAllSources) {
                    (exportBindings[source] ??= []).push('*');
                }
                return exportBindings;
            },
            get exports() {
                return [
                    ...exports.keys(),
                    ...reexportDescriptions.keys(),
                    ...[...exportAllSources].map(() => '*')
                ];
            },
            get hasDefaultExport() {
                // This information is only valid after parsing
                if (!module.ast) {
                    return null;
                }
                return module.exports.has('default') || reexportDescriptions.has('default');
            },
            id,
            get implicitlyLoadedAfterOneOf() {
                return Array.from(implicitlyLoadedAfter, getId).sort();
            },
            get implicitlyLoadedBefore() {
                return Array.from(implicitlyLoadedBefore, getId).sort();
            },
            get importedIdResolutions() {
                return Array.from(sourcesWithAttributes.keys(), source => module.resolvedIds[source]).filter(Boolean);
            },
            get importedIds() {
                // We cannot use this.dependencies because this is needed before
                // dependencies are populated
                return Array.from(sourcesWithAttributes.keys(), source => module.resolvedIds[source]?.id).filter(Boolean);
            },
            get importers() {
                return importers.sort();
            },
            isEntry,
            isExternal: false,
            get isIncluded() {
                if (graph.phase !== BuildPhase.GENERATE) {
                    return null;
                }
                return module.isIncluded();
            },
            meta: { ...meta },
            moduleSideEffects,
            syntheticNamedExports
        };
    }
    basename() {
        const base = basename(this.id);
        const extension = extname(this.id);
        return makeLegal(extension ? base.slice(0, -extension.length) : base);
    }
    bindReferences() {
        this.ast.bind();
    }
    cacheInfoGetters() {
        cacheObjectGetters(this.info, [
            'dynamicallyImportedIdResolutions',
            'dynamicallyImportedIds',
            'dynamicImporters',
            'exportedBindings',
            'exports',
            'hasDefaultExport',
            'implicitlyLoadedAfterOneOf',
            'implicitlyLoadedBefore',
            'importedIdResolutions',
            'importedIds',
            'importers'
        ]);
    }
    error(properties, pos) {
        if (pos !== undefined) {
            this.addLocationToLogProps(properties, pos);
        }
        return error(properties);
    }
    // sum up the length of all ast nodes that are included
    estimateSize() {
        let size = 0;
        for (const node of this.ast.body) {
            if (node.included) {
                size += node.end - node.start;
            }
        }
        return size;
    }
    getAllExportNames() {
        if (this.allExportNames) {
            return this.allExportNames;
        }
        this.allExportNames = new Set([...this.exports.keys(), ...this.reexportDescriptions.keys()]);
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                this.allExportNames.add(`*${module.id}`);
                continue;
            }
            for (const name of module.getAllExportNames()) {
                if (name !== 'default')
                    this.allExportNames.add(name);
            }
        }
        // We do not count the synthetic namespace as a regular export to hide it
        // from entry signatures and namespace objects
        if (typeof this.info.syntheticNamedExports === 'string') {
            this.allExportNames.delete(this.info.syntheticNamedExports);
        }
        return this.allExportNames;
    }
    getDependenciesToBeIncluded() {
        if (this.relevantDependencies)
            return this.relevantDependencies;
        this.relevantDependencies = new Set();
        const necessaryDependencies = new Set();
        const alwaysCheckedDependencies = new Set();
        const dependencyVariables = new Set(this.includedImports);
        if (this.info.isEntry ||
            this.includedDynamicImporters.length > 0 ||
            this.namespace.included ||
            this.implicitlyLoadedAfter.size > 0) {
            for (const exportName of [...this.getReexports(), ...this.getExports()]) {
                const [exportedVariable] = this.getVariableForExportName(exportName);
                if (exportedVariable?.included) {
                    dependencyVariables.add(exportedVariable);
                }
            }
        }
        for (let variable of dependencyVariables) {
            const sideEffectDependencies = this.sideEffectDependenciesByVariable.get(variable);
            if (sideEffectDependencies) {
                for (const module of sideEffectDependencies) {
                    alwaysCheckedDependencies.add(module);
                }
            }
            if (variable instanceof SyntheticNamedExportVariable) {
                variable = variable.getBaseVariable();
            }
            else if (variable instanceof ExportDefaultVariable) {
                variable = variable.getOriginalVariable();
            }
            necessaryDependencies.add(variable.module);
        }
        if (!this.options.treeshake || this.info.moduleSideEffects === 'no-treeshake') {
            for (const dependency of this.dependencies) {
                this.relevantDependencies.add(dependency);
            }
        }
        else {
            this.addRelevantSideEffectDependencies(this.relevantDependencies, necessaryDependencies, alwaysCheckedDependencies);
        }
        for (const dependency of necessaryDependencies) {
            this.relevantDependencies.add(dependency);
        }
        return this.relevantDependencies;
    }
    getExportNamesByVariable() {
        if (this.exportNamesByVariable) {
            return this.exportNamesByVariable;
        }
        const exportNamesByVariable = new Map();
        for (const exportName of this.getAllExportNames()) {
            let [tracedVariable] = this.getVariableForExportName(exportName);
            if (tracedVariable instanceof ExportDefaultVariable) {
                tracedVariable = tracedVariable.getOriginalVariable();
            }
            if (!tracedVariable ||
                !(tracedVariable.included || tracedVariable instanceof ExternalVariable)) {
                continue;
            }
            const existingExportNames = exportNamesByVariable.get(tracedVariable);
            if (existingExportNames) {
                existingExportNames.push(exportName);
            }
            else {
                exportNamesByVariable.set(tracedVariable, [exportName]);
            }
        }
        return (this.exportNamesByVariable = exportNamesByVariable);
    }
    getExports() {
        return [...this.exports.keys()];
    }
    getReexports() {
        if (this.transitiveReexports) {
            return this.transitiveReexports;
        }
        // to avoid infinite recursion when using circular `export * from X`
        this.transitiveReexports = [];
        const reexports = new Set(this.reexportDescriptions.keys());
        for (const module of this.exportAllModules) {
            if (module instanceof ExternalModule) {
                reexports.add(`*${module.id}`);
            }
            else {
                for (const name of [...module.getReexports(), ...module.getExports()]) {
                    if (name !== 'default')
                        reexports.add(name);
                }
            }
        }
        return (this.transitiveReexports = [...reexports]);
    }
    getRenderedExports() {
        // only direct exports are counted here, not reexports at all
        const renderedExports = [];
        const removedExports = [];
        for (const exportName of this.exports.keys()) {
            const [variable] = this.getVariableForExportName(exportName);
            (variable?.included ? renderedExports : removedExports).push(exportName);
        }
        return { removedExports, renderedExports };
    }
    getSyntheticNamespace() {
        if (this.syntheticNamespace === null) {
            this.syntheticNamespace = undefined;
            [this.syntheticNamespace] = this.getVariableForExportName(typeof this.info.syntheticNamedExports === 'string'
                ? this.info.syntheticNamedExports
                : 'default', { onlyExplicit: true });
        }
        if (!this.syntheticNamespace) {
            return error(logSyntheticNamedExportsNeedNamespaceExport(this.id, this.info.syntheticNamedExports));
        }
        return this.syntheticNamespace;
    }
    getVariableForExportName(name, { importerForSideEffects, isExportAllSearch, onlyExplicit, searchedNamesAndModules } = EMPTY_OBJECT) {
        if (name[0] === '*') {
            if (name.length === 1) {
                // export * from './other'
                return [this.namespace];
            }
            // export * from 'external'
            const module = this.graph.modulesById.get(name.slice(1));
            return module.getVariableForExportName('*');
        }
        // export { foo } from './other'
        const reexportDeclaration = this.reexportDescriptions.get(name);
        if (reexportDeclaration) {
            const [variable, options] = getVariableForExportNameRecursive(reexportDeclaration.module, reexportDeclaration.localName, importerForSideEffects, false, searchedNamesAndModules);
            if (!variable) {
                return this.error(logMissingExport(reexportDeclaration.localName, this.id, reexportDeclaration.module.id, !!options?.missingButExportExists), reexportDeclaration.start);
            }
            if (importerForSideEffects) {
                setAlternativeExporterIfCyclic(variable, importerForSideEffects, this);
                if (this.info.moduleSideEffects) {
                    getOrCreate(importerForSideEffects.sideEffectDependenciesByVariable, variable, (getNewSet)).add(this);
                }
            }
            return [variable];
        }
        const exportDeclaration = this.exports.get(name);
        if (exportDeclaration) {
            if (exportDeclaration === MISSING_EXPORT_SHIM_DESCRIPTION) {
                return [this.exportShimVariable];
            }
            const name = exportDeclaration.localName;
            const variable = this.traceVariable(name, {
                importerForSideEffects,
                searchedNamesAndModules
            });
            if (!variable) {
                return [null, { missingButExportExists: true }];
            }
            if (importerForSideEffects) {
                setAlternativeExporterIfCyclic(variable, importerForSideEffects, this);
                getOrCreate(importerForSideEffects.sideEffectDependenciesByVariable, variable, (getNewSet)).add(this);
            }
            return [variable];
        }
        if (onlyExplicit) {
            return [null];
        }
        if (name !== 'default') {
            const foundNamespaceReexport = this.namespaceReexportsByName.get(name) ??
                this.getVariableFromNamespaceReexports(name, importerForSideEffects, searchedNamesAndModules);
            this.namespaceReexportsByName.set(name, foundNamespaceReexport);
            if (foundNamespaceReexport[0]) {
                return foundNamespaceReexport;
            }
        }
        if (this.info.syntheticNamedExports) {
            return [
                getOrCreate(this.syntheticExports, name, () => new SyntheticNamedExportVariable(this.astContext, name, this.getSyntheticNamespace()))
            ];
        }
        // we don't want to create shims when we are just
        // probing export * modules for exports
        if (!isExportAllSearch && this.options.shimMissingExports) {
            this.shimMissingExport(name);
            return [this.exportShimVariable];
        }
        return [null];
    }
    hasEffects() {
        return this.info.moduleSideEffects === 'no-treeshake' || this.ast.hasCachedEffects();
    }
    include() {
        const context = createInclusionContext();
        if (this.ast.shouldBeIncluded(context))
            this.ast.include(context, false);
    }
    includeAllExports(includeNamespaceMembers) {
        if (includeNamespaceMembers) {
            this.namespace.setMergedNamespaces(this.includeAndGetAdditionalMergedNamespaces());
        }
        if (this.allExportsIncluded)
            return;
        this.allExportsIncluded = true;
        if (!this.isExecuted) {
            markModuleAndImpureDependenciesAsExecuted(this);
            this.graph.needsTreeshakingPass = true;
        }
        const inclusionContext = createInclusionContext();
        for (const exportName of this.exports.keys()) {
            if (includeNamespaceMembers || exportName !== this.info.syntheticNamedExports) {
                const variable = this.getVariableForExportName(exportName)[0];
                if (!variable) {
                    return error(logMissingEntryExport(exportName, this.id));
                }
                this.includeVariable(variable, UNKNOWN_PATH, inclusionContext);
                variable.deoptimizePath(UNKNOWN_PATH);
            }
        }
        for (const name of this.getReexports()) {
            const [variable] = this.getVariableForExportName(name);
            if (variable) {
                variable.deoptimizePath(UNKNOWN_PATH);
                this.includeVariable(variable, UNKNOWN_PATH, inclusionContext);
                if (variable instanceof ExternalVariable) {
                    variable.module.reexported = true;
                }
            }
        }
    }
    includeAllInBundle() {
        this.ast.include(createInclusionContext(), true);
        this.includeAllExports(false);
    }
    includeExportsByNames(names) {
        if (!this.isExecuted) {
            markModuleAndImpureDependenciesAsExecuted(this);
            this.graph.needsTreeshakingPass = true;
        }
        let includeNamespaceMembers = false;
        const inclusionContext = createInclusionContext();
        for (const name of names) {
            const variable = this.getVariableForExportName(name)[0];
            if (variable) {
                variable.deoptimizePath(UNKNOWN_PATH);
                this.includeVariable(variable, UNKNOWN_PATH, inclusionContext);
            }
            if (!this.exports.has(name) && !this.reexportDescriptions.has(name)) {
                includeNamespaceMembers = true;
            }
        }
        if (includeNamespaceMembers) {
            this.namespace.setMergedNamespaces(this.includeAndGetAdditionalMergedNamespaces());
        }
    }
    isIncluded() {
        // Modules where this.ast is missing have been loaded via this.load and are
        // not yet fully processed, hence they cannot be included.
        return (this.ast &&
            (this.ast.included ||
                this.namespace.included ||
                this.importedFromNotTreeshaken ||
                this.exportShimVariable.included));
    }
    linkImports() {
        this.addModulesToImportDescriptions(this.importDescriptions);
        this.addModulesToImportDescriptions(this.reexportDescriptions);
        const externalExportAllModules = [];
        for (const source of this.exportAllSources) {
            const module = this.graph.modulesById.get(this.resolvedIds[source].id);
            if (module instanceof ExternalModule) {
                externalExportAllModules.push(module);
                continue;
            }
            this.exportAllModules.push(module);
        }
        this.exportAllModules.push(...externalExportAllModules);
    }
    log(level, properties, pos) {
        this.addLocationToLogProps(properties, pos);
        this.options.onLog(level, properties);
    }
    render(options) {
        const source = this.magicString.clone();
        this.ast.render(source, options);
        source.trim();
        const { usesTopLevelAwait } = this.astContext;
        if (usesTopLevelAwait && options.format !== 'es' && options.format !== 'system') {
            return error(logInvalidFormatForTopLevelAwait(this.id, options.format));
        }
        return { source, usesTopLevelAwait };
    }
    async setSource({ ast, code, customTransformCache, originalCode, originalSourcemap, resolvedIds, sourcemapChain, transformDependencies, transformFiles, ...moduleOptions }) {
        timeStart('generate ast', 3);
        if (code.startsWith('#!')) {
            const shebangEndPosition = code.indexOf('\n');
            this.shebang = code.slice(2, shebangEndPosition);
        }
        this.info.code = code;
        this.originalCode = originalCode;
        // We need to call decodedSourcemap on the input in case they were hydrated from json in the cache and don't
        // have the lazy evaluation cache configured. Right now this isn't enforced by the type system because the
        // RollupCache stores `ExistingDecodedSourcemap` instead of `ExistingRawSourcemap`
        this.originalSourcemap = decodedSourcemap(originalSourcemap);
        this.sourcemapChain = sourcemapChain.map(mapOrMissing => mapOrMissing.missing ? mapOrMissing : decodedSourcemap(mapOrMissing));
        // If coming from cache and this value is already fully decoded, we want to re-encode here to save memory.
        resetSourcemapCache(this.originalSourcemap, this.sourcemapChain);
        if (transformFiles) {
            this.transformFiles = transformFiles;
        }
        this.transformDependencies = transformDependencies;
        this.customTransformCache = customTransformCache;
        this.updateOptions(moduleOptions);
        this.resolvedIds = resolvedIds ?? Object.create(null);
        // By default, `id` is the file name. Custom resolvers and loaders
        // can change that, but it makes sense to use it for the source file name
        const fileName = this.id;
        this.magicString = new MagicString(code, {
            filename: (this.excludeFromSourcemap ? null : fileName), // don't include plugin helpers in sourcemap
            indentExclusionRanges: []
        });
        this.astContext = {
            addDynamicImport: this.addDynamicImport.bind(this),
            addExport: this.addExport.bind(this),
            addImport: this.addImport.bind(this),
            addImportMeta: this.addImportMeta.bind(this),
            addImportSource: this.addImportSource.bind(this),
            code, // Only needed for debugging
            deoptimizationTracker: this.graph.deoptimizationTracker,
            error: this.error.bind(this),
            fileName, // Needed for warnings
            getExports: this.getExports.bind(this),
            getImportedJsxFactoryVariable: this.getImportedJsxFactoryVariable.bind(this),
            getModuleExecIndex: () => this.execIndex,
            getModuleName: this.basename.bind(this),
            getNodeConstructor: (name) => nodeConstructors[name] || nodeConstructors.UnknownNode,
            getReexports: this.getReexports.bind(this),
            importDescriptions: this.importDescriptions,
            includeAllExports: () => this.includeAllExports(true),
            includeDynamicImport: this.includeDynamicImport.bind(this),
            includeVariableInModule: this.includeVariableInModule.bind(this),
            log: this.log.bind(this),
            magicString: this.magicString,
            manualPureFunctions: this.graph.pureFunctions,
            module: this,
            moduleContext: this.context,
            newlyIncludedVariableInits: this.graph.newlyIncludedVariableInits,
            options: this.options,
            requestTreeshakingPass: () => (this.graph.needsTreeshakingPass = true),
            traceExport: (name) => this.getVariableForExportName(name),
            traceVariable: this.traceVariable.bind(this),
            usesTopLevelAwait: false
        };
        this.scope = new ModuleScope(this.graph.scope, this.astContext);
        this.namespace = new NamespaceVariable(this.astContext);
        const programParent = { context: this.astContext, type: 'Module' };
        if (ast) {
            this.ast = new nodeConstructors[ast.type](programParent, this.scope).parseNode(ast);
            this.info.ast = ast;
        }
        else {
            // Measuring asynchronous code does not provide reasonable results
            timeEnd('generate ast', 3);
            const astBuffer = await parseAsync(code, false, this.options.jsx !== false);
            timeStart('generate ast', 3);
            this.ast = convertProgram(astBuffer, programParent, this.scope);
            // Make lazy and apply LRU cache to not hog the memory
            Object.defineProperty(this.info, 'ast', {
                get: () => {
                    if (this.graph.astLru.has(fileName)) {
                        return this.graph.astLru.get(fileName);
                    }
                    else {
                        const parsedAst = this.tryParse();
                        // If the cache is not disabled, we need to keep the AST in memory
                        // until the end when the cache is generated
                        if (this.options.cache !== false) {
                            Object.defineProperty(this.info, 'ast', {
                                value: parsedAst
                            });
                            return parsedAst;
                        }
                        // Otherwise, we keep it in a small LRU cache to not hog too much
                        // memory but allow the same AST to be requested several times.
                        this.graph.astLru.set(fileName, parsedAst);
                        return parsedAst;
                    }
                }
            });
        }
        timeEnd('generate ast', 3);
    }
    toJSON() {
        return {
            ast: this.info.ast,
            attributes: this.info.attributes,
            code: this.info.code,
            customTransformCache: this.customTransformCache,
            dependencies: Array.from(this.dependencies, getId),
            id: this.id,
            meta: this.info.meta,
            moduleSideEffects: this.info.moduleSideEffects,
            originalCode: this.originalCode,
            originalSourcemap: this.originalSourcemap,
            resolvedIds: this.resolvedIds,
            sourcemapChain: this.sourcemapChain,
            syntheticNamedExports: this.info.syntheticNamedExports,
            transformDependencies: this.transformDependencies,
            transformFiles: this.transformFiles
        };
    }
    traceVariable(name, { importerForSideEffects, isExportAllSearch, searchedNamesAndModules } = EMPTY_OBJECT) {
        const localVariable = this.scope.variables.get(name);
        if (localVariable) {
            return localVariable;
        }
        const importDescription = this.importDescriptions.get(name);
        if (importDescription) {
            const otherModule = importDescription.module;
            if (otherModule instanceof Module && importDescription.name === '*') {
                return otherModule.namespace;
            }
            const [declaration, options] = getVariableForExportNameRecursive(otherModule, importDescription.name, importerForSideEffects || this, isExportAllSearch, searchedNamesAndModules);
            if (!declaration) {
                return this.error(logMissingExport(importDescription.name, this.id, otherModule.id, !!options?.missingButExportExists), importDescription.start);
            }
            return declaration;
        }
        return null;
    }
    updateOptions({ meta, moduleSideEffects, syntheticNamedExports }) {
        if (moduleSideEffects != null) {
            this.info.moduleSideEffects = moduleSideEffects;
        }
        if (syntheticNamedExports != null) {
            this.info.syntheticNamedExports = syntheticNamedExports;
        }
        if (meta != null) {
            Object.assign(this.info.meta, meta);
        }
    }
    addDynamicImport(node) {
        let argument = node.sourceAstNode;
        if (argument.type === NodeType.TemplateLiteral) {
            if (argument.quasis.length === 1 &&
                typeof argument.quasis[0].value.cooked === 'string') {
                argument = argument.quasis[0].value.cooked;
            }
        }
        else if (argument.type === NodeType.Literal &&
            typeof argument.value === 'string') {
            argument = argument.value;
        }
        this.dynamicImports.push({ argument, id: null, node, resolution: null });
    }
    assertUniqueExportName(name, nodeStart) {
        if (this.exports.has(name) || this.reexportDescriptions.has(name)) {
            this.error(logDuplicateExportError(name), nodeStart);
        }
    }
    addExport(node) {
        if (node instanceof ExportDefaultDeclaration) {
            // export default foo;
            this.assertUniqueExportName('default', node.start);
            this.exports.set('default', {
                identifier: node.variable.getAssignedVariableName(),
                localName: 'default'
            });
        }
        else if (node instanceof ExportAllDeclaration) {
            const source = node.source.value;
            this.addSource(source, node);
            if (node.exported) {
                // export * as name from './other'
                const name = node.exported instanceof Literal ? node.exported.value : node.exported.name;
                this.assertUniqueExportName(name, node.exported.start);
                this.reexportDescriptions.set(name, {
                    localName: '*',
                    module: null, // filled in later,
                    source,
                    start: node.start
                });
            }
            else {
                // export * from './other'
                this.exportAllSources.add(source);
            }
        }
        else if (node.source instanceof Literal) {
            // export { name } from './other'
            const source = node.source.value;
            this.addSource(source, node);
            for (const { exported, local, start } of node.specifiers) {
                const name = exported instanceof Literal ? exported.value : exported.name;
                this.assertUniqueExportName(name, start);
                this.reexportDescriptions.set(name, {
                    localName: local instanceof Literal ? local.value : local.name,
                    module: null, // filled in later,
                    source,
                    start
                });
            }
        }
        else if (node.declaration) {
            const declaration = node.declaration;
            if (declaration instanceof VariableDeclaration) {
                // export var { foo, bar } = ...
                // export var foo = 1, bar = 2;
                for (const declarator of declaration.declarations) {
                    for (const localName of extractAssignedNames(declarator.id)) {
                        this.assertUniqueExportName(localName, declarator.id.start);
                        this.exports.set(localName, { identifier: null, localName });
                    }
                }
            }
            else {
                // export function foo () {}
                const localName = declaration.id.name;
                this.assertUniqueExportName(localName, declaration.id.start);
                this.exports.set(localName, { identifier: null, localName });
            }
        }
        else {
            // export { foo, bar, baz }
            for (const { local, exported } of node.specifiers) {
                // except for reexports, local must be an Identifier
                const localName = local.name;
                const exportedName = exported instanceof Identifier ? exported.name : exported.value;
                this.assertUniqueExportName(exportedName, exported.start);
                this.exports.set(exportedName, { identifier: null, localName });
            }
        }
    }
    addImport(node) {
        const source = node.source.value;
        this.addSource(source, node);
        for (const specifier of node.specifiers) {
            const localName = specifier.local.name;
            if (this.scope.variables.has(localName) || this.importDescriptions.has(localName)) {
                this.error(logRedeclarationError(localName), specifier.local.start);
            }
            const name = specifier instanceof ImportDefaultSpecifier
                ? 'default'
                : specifier instanceof ImportNamespaceSpecifier
                    ? '*'
                    : specifier.imported instanceof Identifier
                        ? specifier.imported.name
                        : specifier.imported.value;
            this.importDescriptions.set(localName, {
                module: null, // filled in later
                name,
                source,
                start: specifier.start
            });
        }
    }
    addImportSource(importSource) {
        if (importSource && !this.sourcesWithAttributes.has(importSource)) {
            this.sourcesWithAttributes.set(importSource, EMPTY_OBJECT);
        }
    }
    addImportMeta(node) {
        this.importMetas.push(node);
    }
    addLocationToLogProps(properties, pos) {
        properties.id = this.id;
        properties.pos = pos;
        let code = this.info.code;
        const location = locate(code, pos, { offsetLine: 1 });
        if (location) {
            let { column, line } = location;
            try {
                ({ column, line } = getOriginalLocation(this.sourcemapChain, { column, line }));
                code = this.originalCode;
            }
            catch (error_) {
                this.options.onLog(LOGLEVEL_WARN, logInvalidSourcemapForError(error_, this.id, column, line, pos));
            }
            augmentCodeLocation(properties, { column, line }, code, this.id);
        }
    }
    addModulesToImportDescriptions(importDescription) {
        for (const specifier of importDescription.values()) {
            const { id } = this.resolvedIds[specifier.source];
            specifier.module = this.graph.modulesById.get(id);
        }
    }
    addRelevantSideEffectDependencies(relevantDependencies, necessaryDependencies, alwaysCheckedDependencies) {
        const handledDependencies = new Set();
        const addSideEffectDependencies = (possibleDependencies) => {
            for (const dependency of possibleDependencies) {
                if (handledDependencies.has(dependency)) {
                    continue;
                }
                handledDependencies.add(dependency);
                if (necessaryDependencies.has(dependency)) {
                    relevantDependencies.add(dependency);
                    continue;
                }
                if (!(dependency.info.moduleSideEffects || alwaysCheckedDependencies.has(dependency))) {
                    continue;
                }
                if (dependency instanceof ExternalModule || dependency.hasEffects()) {
                    relevantDependencies.add(dependency);
                    continue;
                }
                addSideEffectDependencies(dependency.dependencies);
            }
        };
        addSideEffectDependencies(this.dependencies);
        addSideEffectDependencies(alwaysCheckedDependencies);
    }
    addSource(source, declaration) {
        const parsedAttributes = getAttributesFromImportExportDeclaration(declaration.attributes);
        const existingAttributes = this.sourcesWithAttributes.get(source);
        if (existingAttributes) {
            if (doAttributesDiffer(existingAttributes, parsedAttributes)) {
                this.log(LOGLEVEL_WARN, logInconsistentImportAttributes(existingAttributes, parsedAttributes, source, this.id), declaration.start);
            }
        }
        else {
            this.sourcesWithAttributes.set(source, parsedAttributes);
        }
    }
    getImportedJsxFactoryVariable(baseName, nodeStart, importSource) {
        const { id } = this.resolvedIds[importSource];
        const module = this.graph.modulesById.get(id);
        const [variable] = module.getVariableForExportName(baseName);
        if (!variable) {
            return this.error(logMissingJsxExport(baseName, id, this.id), nodeStart);
        }
        return variable;
    }
    getVariableFromNamespaceReexports(name, importerForSideEffects, searchedNamesAndModules) {
        let foundSyntheticDeclaration = null;
        const foundInternalDeclarations = new Map();
        const foundExternalDeclarations = new Set();
        for (const module of this.exportAllModules) {
            // Synthetic namespaces should not hide "regular" exports of the same name
            if (module.info.syntheticNamedExports === name) {
                continue;
            }
            const [variable, options] = getVariableForExportNameRecursive(module, name, importerForSideEffects, true, 
            // We are creating a copy to handle the case where the same binding is
            // imported through different namespace reexports gracefully
            copyNameToModulesMap(searchedNamesAndModules));
            if (module instanceof ExternalModule || options?.indirectExternal) {
                foundExternalDeclarations.add(variable);
            }
            else if (variable instanceof SyntheticNamedExportVariable) {
                if (!foundSyntheticDeclaration) {
                    foundSyntheticDeclaration = variable;
                }
            }
            else if (variable) {
                foundInternalDeclarations.set(variable, module);
            }
        }
        if (foundInternalDeclarations.size > 0) {
            const foundDeclarationList = [...foundInternalDeclarations];
            const usedDeclaration = foundDeclarationList[0][0];
            if (foundDeclarationList.length === 1) {
                return [usedDeclaration];
            }
            this.options.onLog(LOGLEVEL_WARN, logNamespaceConflict(name, this.id, foundDeclarationList.map(([, module]) => module.id)));
            // TODO we are pretending it was not found while it should behave like "undefined"
            return [null];
        }
        if (foundExternalDeclarations.size > 0) {
            const foundDeclarationList = [...foundExternalDeclarations];
            const usedDeclaration = foundDeclarationList[0];
            if (foundDeclarationList.length > 1) {
                this.options.onLog(LOGLEVEL_WARN, logAmbiguousExternalNamespaces(name, this.id, usedDeclaration.module.id, foundDeclarationList.map(declaration => declaration.module.id)));
            }
            return [usedDeclaration, { indirectExternal: true }];
        }
        if (foundSyntheticDeclaration) {
            return [foundSyntheticDeclaration];
        }
        return [null];
    }
    includeAndGetAdditionalMergedNamespaces() {
        const externalNamespaces = new Set();
        const syntheticNamespaces = new Set();
        for (const module of [this, ...this.exportAllModules]) {
            if (module instanceof ExternalModule) {
                const [externalVariable] = module.getVariableForExportName('*');
                externalVariable.includePath(UNKNOWN_PATH, createInclusionContext());
                this.includedImports.add(externalVariable);
                externalNamespaces.add(externalVariable);
            }
            else if (module.info.syntheticNamedExports) {
                const syntheticNamespace = module.getSyntheticNamespace();
                syntheticNamespace.includePath(UNKNOWN_PATH, createInclusionContext());
                this.includedImports.add(syntheticNamespace);
                syntheticNamespaces.add(syntheticNamespace);
            }
        }
        return [...syntheticNamespaces, ...externalNamespaces];
    }
    includeDynamicImport(node) {
        const resolution = this.dynamicImports.find(dynamicImport => dynamicImport.node === node).resolution;
        if (resolution instanceof Module) {
            if (!resolution.includedDynamicImporters.includes(this)) {
                resolution.includedDynamicImporters.push(this);
                if (node.withinTopLevelAwait) {
                    resolution.includedDirectTopLevelAwaitingDynamicImporters.add(this);
                }
            }
            const importedNames = this.options.treeshake
                ? node.getDeterministicImportedNames()
                : undefined;
            if (importedNames) {
                resolution.includeExportsByNames(importedNames);
            }
            else {
                resolution.includeAllExports(true);
            }
        }
    }
    includeVariable(variable, path, context) {
        const { included, module: variableModule } = variable;
        variable.includePath(path, context);
        if (included) {
            if (variableModule instanceof Module && variableModule !== this) {
                getAndExtendSideEffectModules(variable, this);
            }
        }
        else {
            this.graph.needsTreeshakingPass = true;
            if (variableModule instanceof Module) {
                if (!variableModule.isExecuted) {
                    markModuleAndImpureDependenciesAsExecuted(variableModule);
                }
                if (variableModule !== this) {
                    const sideEffectModules = getAndExtendSideEffectModules(variable, this);
                    for (const module of sideEffectModules) {
                        if (!module.isExecuted) {
                            markModuleAndImpureDependenciesAsExecuted(module);
                        }
                    }
                }
            }
        }
    }
    includeVariableInModule(variable, path, context) {
        this.includeVariable(variable, path, context);
        const variableModule = variable.module;
        if (variableModule && variableModule !== this) {
            this.includedImports.add(variable);
        }
    }
    shimMissingExport(name) {
        this.options.onLog(LOGLEVEL_WARN, logShimmedExport(this.id, name));
        this.exports.set(name, MISSING_EXPORT_SHIM_DESCRIPTION);
    }
    tryParse() {
        try {
            return parseAst(this.info.code, { jsx: this.options.jsx !== false });
        }
        catch (error_) {
            return this.error(logModuleParseError(error_, this.id), error_.pos);
        }
    }
}
// if there is a cyclic import in the reexport chain, we should not
// import from the original module but from the cyclic module to not
// mess up execution order.
function setAlternativeExporterIfCyclic(variable, importer, reexporter) {
    if (variable.module instanceof Module && variable.module !== reexporter) {
        const exporterCycles = variable.module.cycles;
        if (exporterCycles.size > 0) {
            const importerCycles = reexporter.cycles;
            for (const cycleSymbol of importerCycles) {
                if (exporterCycles.has(cycleSymbol)) {
                    importer.alternativeReexportModules.set(variable, reexporter);
                    break;
                }
            }
        }
    }
}
const copyNameToModulesMap = (searchedNamesAndModules) => searchedNamesAndModules &&
    new Map(Array.from(searchedNamesAndModules, ([name, modules]) => [name, new Set(modules)]));
