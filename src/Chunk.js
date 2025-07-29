import MagicString, { Bundle as MagicStringBundle } from 'magic-string';
import { relative } from '../browser/src/path';
import ExportDefaultDeclaration from './ast/nodes/ExportDefaultDeclaration';
import FunctionDeclaration from './ast/nodes/FunctionDeclaration';
import { formatsMaybeAccessDocumentCurrentScript } from './ast/nodes/MetaProperty';
import ExportDefaultVariable from './ast/variables/ExportDefaultVariable';
import LocalVariable from './ast/variables/LocalVariable';
import NamespaceVariable from './ast/variables/NamespaceVariable';
import SyntheticNamedExportVariable from './ast/variables/SyntheticNamedExportVariable';
import ExternalChunk, { formatAttributes } from './ExternalChunk';
import ExternalModule from './ExternalModule';
import finalisers from './finalisers/index';
import Module from './Module';
import { createAddons } from './utils/addons';
import { EMPTY_OBJECT } from './utils/blank';
import { deconflictChunk } from './utils/deconflictChunk';
import { escapeId } from './utils/escapeId';
import { assignExportsToMangledNames, assignExportsToNames } from './utils/exportNames';
import getExportMode from './utils/getExportMode';
import getIndentString from './utils/getIndentString';
import { getNewArray, getOrCreate } from './utils/getOrCreate';
import { getStaticDependencies } from './utils/getStaticDependencies';
import { DEFAULT_HASH_SIZE, replacePlaceholders } from './utils/hashPlaceholders';
import { makeLegal } from './utils/identifierHelpers';
import { defaultInteropHelpersByInteropType, DOCUMENT_CURRENT_SCRIPT, HELPER_NAMES, isDefaultAProperty, namespaceInteropHelpersByInteropType } from './utils/interopHelpers';
import { LOGLEVEL_WARN } from './utils/logging';
import { error, logCyclicCrossChunkReexport, logEmptyChunk, logMissingGlobalName, logUnexpectedNamedImport, logUnexpectedNamespaceReexport } from './utils/logs';
import { FILE_PLACEHOLDER } from './utils/outputBundle';
import { getAttributesFromImportExpression } from './utils/parseImportAttributes';
import { basename, extname, isAbsolute, normalize, resolve } from './utils/path';
import { getAliasName, getImportPath } from './utils/relativeId';
import { makeUnique, renderNamePattern } from './utils/renderNamePattern';
import { MISSING_EXPORT_SHIM_VARIABLE } from './utils/variableNames';
const NON_ASSET_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.mts',
    '.cjs',
    '.cts'
]);
function getGlobalName(chunk, globals, hasExports, log) {
    const globalName = typeof globals === 'function' ? globals(chunk.id) : globals[chunk.id];
    if (globalName) {
        return globalName;
    }
    if (hasExports) {
        log(LOGLEVEL_WARN, logMissingGlobalName(chunk.id, chunk.variableName));
        return chunk.variableName;
    }
}
export default class Chunk {
    constructor(orderedModules, inputOptions, outputOptions, unsetOptions, pluginDriver, modulesById, chunkByModule, externalChunkByModule, facadeChunkByModule, includedNamespaces, manualChunkAlias, getPlaceholder, bundle, inputBase, snippets) {
        this.orderedModules = orderedModules;
        this.inputOptions = inputOptions;
        this.outputOptions = outputOptions;
        this.unsetOptions = unsetOptions;
        this.pluginDriver = pluginDriver;
        this.modulesById = modulesById;
        this.chunkByModule = chunkByModule;
        this.externalChunkByModule = externalChunkByModule;
        this.facadeChunkByModule = facadeChunkByModule;
        this.includedNamespaces = includedNamespaces;
        this.manualChunkAlias = manualChunkAlias;
        this.getPlaceholder = getPlaceholder;
        this.bundle = bundle;
        this.inputBase = inputBase;
        this.snippets = snippets;
        this.dependencies = new Set();
        this.entryModules = [];
        this.exportMode = 'named';
        this.facadeModule = null;
        this.namespaceVariableName = '';
        this.variableName = '';
        this.accessedGlobalsByScope = new Map();
        this.dynamicEntryModules = [];
        this.dynamicName = null;
        this.exportNamesByVariable = new Map();
        this.exports = new Set();
        this.exportsByName = new Map();
        this.fileName = null;
        this.implicitEntryModules = [];
        this.implicitlyLoadedBefore = new Set();
        this.imports = new Set();
        this.includedDynamicImports = null;
        this.includedReexportsByModule = new Map();
        // This may be updated in the constructor
        this.isEmpty = true;
        this.name = null;
        this.needsExportsShim = false;
        this.preRenderedChunkInfo = null;
        this.preliminaryFileName = null;
        this.preliminarySourcemapFileName = null;
        this.renderedChunkInfo = null;
        this.renderedDependencies = null;
        this.renderedModules = Object.create(null);
        this.sortedExportNames = null;
        this.strictFacade = false;
        /** Modules with 'allow-extension' that should have preserved exports within the chunk */
        this.allowExtensionModules = new Set();
        this.execIndex = orderedModules.length > 0 ? orderedModules[0].execIndex : Infinity;
        const chunkModules = new Set(orderedModules);
        for (const module of orderedModules) {
            chunkByModule.set(module, this);
            if (module.namespace.included && !outputOptions.preserveModules) {
                includedNamespaces.add(module);
            }
            if (this.isEmpty && module.isIncluded()) {
                this.isEmpty = false;
            }
            if (module.info.isEntry || outputOptions.preserveModules) {
                this.entryModules.push(module);
            }
            for (const importer of module.includedDynamicImporters) {
                if (!chunkModules.has(importer)) {
                    this.dynamicEntryModules.push(module);
                    // Modules with synthetic exports need an artificial namespace for dynamic imports
                    if (module.info.syntheticNamedExports) {
                        includedNamespaces.add(module);
                        this.exports.add(module.namespace);
                    }
                }
            }
            if (module.implicitlyLoadedAfter.size > 0) {
                this.implicitEntryModules.push(module);
            }
        }
        this.suggestedVariableName = makeLegal(this.generateVariableName());
    }
    static generateFacade(inputOptions, outputOptions, unsetOptions, pluginDriver, modulesById, chunkByModule, externalChunkByModule, facadeChunkByModule, includedNamespaces, facadedModule, facadeName, getPlaceholder, bundle, inputBase, snippets) {
        const chunk = new Chunk([], inputOptions, outputOptions, unsetOptions, pluginDriver, modulesById, chunkByModule, externalChunkByModule, facadeChunkByModule, includedNamespaces, null, getPlaceholder, bundle, inputBase, snippets);
        chunk.assignFacadeName(facadeName, facadedModule);
        if (!facadeChunkByModule.has(facadedModule)) {
            facadeChunkByModule.set(facadedModule, chunk);
        }
        for (const dependency of facadedModule.getDependenciesToBeIncluded()) {
            chunk.dependencies.add(dependency instanceof Module
                ? chunkByModule.get(dependency)
                : externalChunkByModule.get(dependency));
        }
        if (!chunk.dependencies.has(chunkByModule.get(facadedModule)) &&
            facadedModule.info.moduleSideEffects &&
            facadedModule.hasEffects()) {
            chunk.dependencies.add(chunkByModule.get(facadedModule));
        }
        chunk.ensureReexportsAreAvailableForModule(facadedModule);
        chunk.facadeModule = facadedModule;
        chunk.strictFacade = true;
        return chunk;
    }
    canModuleBeFacade(module, exposedVariables) {
        const moduleExportNamesByVariable = module.getExportNamesByVariable();
        // All exports of this chunk need to be exposed by the candidate module
        for (const exposedVariable of this.exports) {
            if (!moduleExportNamesByVariable.has(exposedVariable)) {
                return false;
            }
        }
        // Additionally, we need to expose namespaces of dynamic entries that are not the facade module and exports from other entry modules
        for (const exposedVariable of exposedVariables) {
            if (!(exposedVariable.module === module ||
                moduleExportNamesByVariable.has(exposedVariable) ||
                (exposedVariable instanceof SyntheticNamedExportVariable &&
                    moduleExportNamesByVariable.has(exposedVariable.getBaseVariable())))) {
                return false;
            }
        }
        return true;
    }
    finalizeChunk(code, map, sourcemapFileName, hashesByPlaceholder) {
        const renderedChunkInfo = this.getRenderedChunkInfo();
        const finalize = (code) => replacePlaceholders(code, hashesByPlaceholder);
        const preliminaryFileName = renderedChunkInfo.fileName;
        const fileName = (this.fileName = finalize(preliminaryFileName));
        return {
            ...renderedChunkInfo,
            code,
            dynamicImports: renderedChunkInfo.dynamicImports.map(finalize),
            fileName,
            implicitlyLoadedBefore: renderedChunkInfo.implicitlyLoadedBefore.map(finalize),
            importedBindings: Object.fromEntries(Object.entries(renderedChunkInfo.importedBindings).map(([fileName, bindings]) => [
                finalize(fileName),
                bindings
            ])),
            imports: renderedChunkInfo.imports.map(finalize),
            map,
            preliminaryFileName,
            referencedFiles: renderedChunkInfo.referencedFiles.map(finalize),
            sourcemapFileName
        };
    }
    generateExports() {
        this.sortedExportNames = null;
        const remainingExports = new Set(this.exports);
        if (this.facadeModule !== null &&
            (this.facadeModule.preserveSignature !== false || this.strictFacade)) {
            const exportNamesByVariable = this.facadeModule.getExportNamesByVariable();
            for (const [variable, exportNames] of exportNamesByVariable) {
                this.exportNamesByVariable.set(variable, [...exportNames]);
                for (const exportName of exportNames) {
                    this.exportsByName.set(exportName, variable);
                }
                remainingExports.delete(variable);
            }
        }
        for (const module of this.allowExtensionModules) {
            const exportNamesByVariable = module.getExportNamesByVariable();
            for (const [variable, exportNames] of exportNamesByVariable) {
                this.exportNamesByVariable.set(variable, [...exportNames]);
                for (const exportName of exportNames) {
                    this.exportsByName.set(exportName, variable);
                }
                remainingExports.delete(variable);
            }
        }
        if (this.outputOptions.minifyInternalExports) {
            assignExportsToMangledNames(remainingExports, this.exportsByName, this.exportNamesByVariable);
        }
        else {
            assignExportsToNames(remainingExports, this.exportsByName, this.exportNamesByVariable);
        }
        if (this.outputOptions.preserveModules || (this.facadeModule && this.facadeModule.info.isEntry))
            this.exportMode = getExportMode(this, this.outputOptions, this.facadeModule.id, this.inputOptions.onLog);
    }
    generateFacades() {
        const facades = [];
        const entryModules = new Set([...this.entryModules, ...this.implicitEntryModules]);
        const exposedVariables = new Set(this.dynamicEntryModules.map(({ namespace }) => namespace));
        for (const module of entryModules) {
            if (module.preserveSignature === 'allow-extension') {
                const canPreserveExports = this.canPreserveModuleExports(module);
                if (canPreserveExports &&
                    !module.chunkFileNames.size &&
                    module.chunkNames.every(({ isUserDefined }) => !isUserDefined)) {
                    this.allowExtensionModules.add(module);
                    if (!this.facadeModule) {
                        this.facadeModule = module;
                        this.strictFacade = false;
                        this.assignFacadeName({}, module, this.outputOptions.preserveModules);
                    }
                    this.facadeChunkByModule.set(module, this);
                    continue;
                }
            }
            const requiredFacades = Array.from(new Set(module.chunkNames.filter(({ isUserDefined }) => isUserDefined).map(({ name }) => name)), 
            // mapping must run after Set 'name' dedupe
            name => ({
                name
            }));
            if (requiredFacades.length === 0 && module.isUserDefinedEntryPoint) {
                requiredFacades.push({});
            }
            requiredFacades.push(...Array.from(module.chunkFileNames, fileName => ({ fileName })));
            if (requiredFacades.length === 0) {
                requiredFacades.push({});
            }
            if (!this.facadeModule) {
                const needsStrictFacade = !this.outputOptions.preserveModules &&
                    (module.preserveSignature === 'strict' ||
                        (module.preserveSignature === 'exports-only' &&
                            module.getExportNamesByVariable().size > 0));
                if (!needsStrictFacade || this.canModuleBeFacade(module, exposedVariables)) {
                    this.facadeModule = module;
                    this.facadeChunkByModule.set(module, this);
                    if (module.preserveSignature) {
                        this.strictFacade = needsStrictFacade;
                    }
                    this.assignFacadeName(requiredFacades.shift(), module, this.outputOptions.preserveModules);
                }
            }
            for (const facadeName of requiredFacades) {
                facades.push(Chunk.generateFacade(this.inputOptions, this.outputOptions, this.unsetOptions, this.pluginDriver, this.modulesById, this.chunkByModule, this.externalChunkByModule, this.facadeChunkByModule, this.includedNamespaces, module, facadeName, this.getPlaceholder, this.bundle, this.inputBase, this.snippets));
            }
        }
        for (const module of this.dynamicEntryModules) {
            if (module.info.syntheticNamedExports)
                continue;
            if (!this.facadeModule && this.canModuleBeFacade(module, exposedVariables)) {
                this.facadeModule = module;
                this.facadeChunkByModule.set(module, this);
                this.strictFacade = true;
                this.dynamicName = getChunkNameFromModule(module);
            }
            else if (this.facadeModule === module &&
                !this.strictFacade &&
                this.canModuleBeFacade(module, exposedVariables)) {
                this.strictFacade = true;
            }
            else if (!this.facadeChunkByModule.get(module)?.strictFacade) {
                this.includedNamespaces.add(module);
                this.exports.add(module.namespace);
            }
        }
        if (!this.outputOptions.preserveModules) {
            this.addNecessaryImportsForFacades();
        }
        return facades;
    }
    canPreserveModuleExports(module) {
        const exportNamesByVariable = module.getExportNamesByVariable();
        // Check for conflicts - an export name is a conflict if it points to a different module or definition
        for (const [variable, exportNames] of exportNamesByVariable) {
            for (const exportName of exportNames) {
                const existingVariable = this.exportsByName.get(exportName);
                // It's ok if the same export name in two modules references the exact same variable
                if (existingVariable && existingVariable !== variable) {
                    return false;
                }
            }
        }
        // No actual conflicts found, add export names for future conflict checks
        for (const [variable, exportNames] of exportNamesByVariable) {
            for (const exportName of exportNames) {
                this.exportsByName.set(exportName, variable);
            }
        }
        return true;
    }
    getChunkName() {
        return (this.name ??= this.outputOptions.sanitizeFileName(this.getFallbackChunkName()));
    }
    getExportNames() {
        return (this.sortedExportNames ??= [...this.exportsByName.keys()].sort());
    }
    getFileName() {
        return this.fileName || this.getPreliminaryFileName().fileName;
    }
    getImportPath(importer) {
        return escapeId(getImportPath(importer, this.getFileName(), this.outputOptions.format === 'amd' && !this.outputOptions.amd.forceJsExtensionForImports, true));
    }
    getPreliminaryFileName() {
        if (this.preliminaryFileName) {
            return this.preliminaryFileName;
        }
        let fileName;
        let hashPlaceholder = null;
        const { chunkFileNames, entryFileNames, file, format, preserveModules } = this.outputOptions;
        if (file) {
            fileName = basename(file);
        }
        else if (this.fileName === null) {
            const [pattern, patternName] = preserveModules || this.facadeModule?.isUserDefinedEntryPoint
                ? [entryFileNames, 'output.entryFileNames']
                : [chunkFileNames, 'output.chunkFileNames'];
            fileName = renderNamePattern(typeof pattern === 'function' ? pattern(this.getPreRenderedChunkInfo()) : pattern, patternName, {
                format: () => format,
                hash: size => hashPlaceholder ||
                    (hashPlaceholder = this.getPlaceholder(patternName, size || DEFAULT_HASH_SIZE)),
                name: () => this.getChunkName()
            });
            if (!hashPlaceholder) {
                fileName = makeUnique(fileName, this.bundle);
            }
        }
        else {
            fileName = this.fileName;
        }
        if (!hashPlaceholder) {
            this.bundle[fileName] = FILE_PLACEHOLDER;
        }
        // Caching is essential to not conflict with the file name reservation above
        return (this.preliminaryFileName = { fileName, hashPlaceholder });
    }
    getPreliminarySourcemapFileName() {
        if (this.preliminarySourcemapFileName) {
            return this.preliminarySourcemapFileName;
        }
        let sourcemapFileName = null;
        let hashPlaceholder = null;
        const { sourcemapFileNames, format } = this.outputOptions;
        if (sourcemapFileNames) {
            const [pattern, patternName] = [sourcemapFileNames, 'output.sourcemapFileNames'];
            sourcemapFileName = renderNamePattern(typeof pattern === 'function' ? pattern(this.getPreRenderedChunkInfo()) : pattern, patternName, {
                chunkhash: () => this.getPreliminaryFileName().hashPlaceholder || '',
                format: () => format,
                hash: size => hashPlaceholder ||
                    (hashPlaceholder = this.getPlaceholder(patternName, size || DEFAULT_HASH_SIZE)),
                name: () => this.getChunkName()
            });
            if (!hashPlaceholder) {
                sourcemapFileName = makeUnique(sourcemapFileName, this.bundle);
            }
        }
        else {
            return null;
        }
        return (this.preliminarySourcemapFileName = { fileName: sourcemapFileName, hashPlaceholder });
    }
    getRenderedChunkInfo() {
        if (this.renderedChunkInfo) {
            return this.renderedChunkInfo;
        }
        return (this.renderedChunkInfo = {
            ...this.getPreRenderedChunkInfo(),
            dynamicImports: this.getDynamicDependencies().map(resolveFileName),
            fileName: this.getFileName(),
            implicitlyLoadedBefore: Array.from(this.implicitlyLoadedBefore, resolveFileName),
            importedBindings: getImportedBindingsPerDependency(this.getRenderedDependencies(), resolveFileName),
            imports: Array.from(this.dependencies, resolveFileName),
            modules: this.renderedModules,
            referencedFiles: this.getReferencedFiles()
        });
    }
    getVariableExportName(variable) {
        if (this.outputOptions.preserveModules && variable instanceof NamespaceVariable) {
            return '*';
        }
        return this.exportNamesByVariable.get(variable)[0];
    }
    link() {
        this.dependencies = getStaticDependencies(this, this.orderedModules, this.chunkByModule, this.externalChunkByModule);
        for (const module of this.orderedModules) {
            this.addImplicitlyLoadedBeforeFromModule(module);
            this.setUpChunkImportsAndExportsForModule(module);
        }
    }
    inlineTransitiveImports() {
        const { facadeModule, dependencies, outputOptions } = this;
        const { hoistTransitiveImports, preserveModules } = outputOptions;
        // for static and dynamic entry points, add transitive dependencies to this
        // chunk's dependencies to avoid loading latency
        if (hoistTransitiveImports && !preserveModules && facadeModule !== null) {
            for (const dep of dependencies) {
                if (dep instanceof Chunk)
                    this.inlineChunkDependencies(dep);
            }
        }
    }
    async render() {
        const { exportMode, facadeModule, inputOptions: { onLog }, outputOptions, pluginDriver, snippets } = this;
        const { format, preserveModules } = outputOptions;
        const preliminaryFileName = this.getPreliminaryFileName();
        const preliminarySourcemapFileName = this.getPreliminarySourcemapFileName();
        const { accessedGlobals, indent, magicString, renderedSource, usedModules, usesTopLevelAwait } = this.renderModules(preliminaryFileName.fileName);
        const renderedDependencies = [...this.getRenderedDependencies().values()];
        const renderedExports = exportMode === 'none' ? [] : this.getChunkExportDeclarations(format);
        let hasExports = renderedExports.length > 0;
        let hasDefaultExport = false;
        for (const renderedDependency of renderedDependencies) {
            const { reexports } = renderedDependency;
            if (reexports?.length) {
                hasExports = true;
                if (!hasDefaultExport && reexports.some(reexport => reexport.reexported === 'default')) {
                    hasDefaultExport = true;
                }
                if (format === 'es') {
                    renderedDependency.reexports = reexports.filter(({ reexported }) => !renderedExports.find(({ exported }) => exported === reexported));
                }
            }
        }
        if (!hasDefaultExport) {
            for (const { exported } of renderedExports) {
                if (exported === 'default') {
                    hasDefaultExport = true;
                    break;
                }
            }
        }
        const { intro, outro, banner, footer } = await createAddons(outputOptions, pluginDriver, this.getRenderedChunkInfo());
        finalisers[format](renderedSource, {
            accessedGlobals,
            dependencies: renderedDependencies,
            exports: renderedExports,
            hasDefaultExport,
            hasExports,
            id: preliminaryFileName.fileName,
            indent,
            intro,
            isEntryFacade: preserveModules || (facadeModule !== null && facadeModule.info.isEntry),
            isModuleFacade: facadeModule !== null,
            log: onLog,
            namedExportsMode: exportMode !== 'default',
            outro,
            snippets,
            usesTopLevelAwait
        }, outputOptions);
        if (banner)
            magicString.prepend(banner);
        if (format === 'es' || format === 'cjs') {
            const shebang = facadeModule !== null && facadeModule.info.isEntry && facadeModule.shebang;
            if (shebang) {
                magicString.prepend(`#!${shebang}\n`);
            }
        }
        if (footer)
            magicString.append(footer);
        return {
            chunk: this,
            magicString,
            preliminaryFileName,
            preliminarySourcemapFileName,
            usedModules
        };
    }
    addImplicitlyLoadedBeforeFromModule(baseModule) {
        const { chunkByModule, implicitlyLoadedBefore } = this;
        for (const module of baseModule.implicitlyLoadedBefore) {
            const chunk = chunkByModule.get(module);
            if (chunk && chunk !== this) {
                implicitlyLoadedBefore.add(chunk);
            }
        }
    }
    addNecessaryImportsForFacades() {
        for (const [module, variables] of this.includedReexportsByModule) {
            if (this.includedNamespaces.has(module)) {
                for (const variable of variables) {
                    this.imports.add(variable);
                }
            }
        }
    }
    assignFacadeName({ fileName, name }, facadedModule, preservePath) {
        if (fileName) {
            this.fileName = fileName;
        }
        else {
            this.name = this.outputOptions.sanitizeFileName(name ||
                (preservePath
                    ? this.getPreserveModulesChunkNameFromModule(facadedModule)
                    : getChunkNameFromModule(facadedModule)));
        }
    }
    checkCircularDependencyImport(variable, importingModule) {
        const variableModule = variable.module;
        if (variableModule instanceof Module) {
            const exportChunk = this.chunkByModule.get(variableModule);
            let alternativeReexportModule;
            do {
                alternativeReexportModule = importingModule.alternativeReexportModules.get(variable);
                if (alternativeReexportModule) {
                    const exportingChunk = this.chunkByModule.get(alternativeReexportModule);
                    if (exportingChunk !== exportChunk) {
                        this.inputOptions.onLog(LOGLEVEL_WARN, logCyclicCrossChunkReexport(
                        // Namespaces do not have an export name
                        variableModule.getExportNamesByVariable().get(variable)?.[0] || '*', variableModule.id, alternativeReexportModule.id, importingModule.id, this.outputOptions.preserveModules));
                    }
                    importingModule = alternativeReexportModule;
                }
            } while (alternativeReexportModule);
        }
    }
    ensureReexportsAreAvailableForModule(module) {
        const includedReexports = [];
        const map = module.getExportNamesByVariable();
        for (const exportedVariable of map.keys()) {
            const isSynthetic = exportedVariable instanceof SyntheticNamedExportVariable;
            const importedVariable = isSynthetic ? exportedVariable.getBaseVariable() : exportedVariable;
            this.checkCircularDependencyImport(importedVariable, module);
            // When preserving modules, we do not create namespace objects but directly
            // use the actual namespaces, which would be broken by this logic.
            if (!(importedVariable instanceof NamespaceVariable && this.outputOptions.preserveModules)) {
                const exportingModule = importedVariable.module;
                if (exportingModule instanceof Module) {
                    const chunk = this.chunkByModule.get(exportingModule);
                    if (chunk && chunk !== this) {
                        chunk.exports.add(importedVariable);
                        includedReexports.push(importedVariable);
                        if (isSynthetic) {
                            this.imports.add(importedVariable);
                        }
                    }
                }
            }
        }
        if (includedReexports.length > 0) {
            this.includedReexportsByModule.set(module, includedReexports);
        }
    }
    generateVariableName() {
        if (this.manualChunkAlias) {
            return this.manualChunkAlias;
        }
        const moduleForNaming = this.entryModules[0] ||
            this.implicitEntryModules[0] ||
            this.dynamicEntryModules[0] ||
            this.orderedModules[this.orderedModules.length - 1];
        if (moduleForNaming) {
            return getChunkNameFromModule(moduleForNaming);
        }
        return 'chunk';
    }
    getChunkExportDeclarations(format) {
        const exports = [];
        for (const exportName of this.getExportNames()) {
            if (exportName[0] === '*')
                continue;
            const variable = this.exportsByName.get(exportName);
            if (!(variable instanceof SyntheticNamedExportVariable)) {
                const module = variable.module;
                if (module) {
                    const chunk = this.chunkByModule.get(module);
                    if (chunk !== this) {
                        if (!chunk || format !== 'es') {
                            continue;
                        }
                        const chunkDep = this.renderedDependencies.get(chunk);
                        if (!chunkDep) {
                            continue;
                        }
                        const { imports, reexports } = chunkDep;
                        const importedByReexported = reexports?.find(({ reexported }) => reexported === exportName);
                        const isImported = imports?.find(({ imported }) => imported === importedByReexported?.imported);
                        if (!isImported) {
                            continue;
                        }
                    }
                }
            }
            let expression = null;
            let hoisted = false;
            let local = variable.getName(this.snippets.getPropertyAccess);
            if (variable instanceof LocalVariable) {
                for (const declaration of variable.declarations) {
                    if (declaration.parent instanceof FunctionDeclaration ||
                        (declaration instanceof ExportDefaultDeclaration &&
                            declaration.declaration instanceof FunctionDeclaration)) {
                        hoisted = true;
                        break;
                    }
                }
            }
            else if (variable instanceof SyntheticNamedExportVariable) {
                expression = local;
                if (format === 'es') {
                    local = variable.renderName;
                }
            }
            exports.push({
                exported: exportName,
                expression,
                hoisted,
                local
            });
        }
        return exports;
    }
    getDependenciesToBeDeconflicted(addNonNamespacesAndInteropHelpers, addDependenciesWithoutBindings, interop) {
        const dependencies = new Set();
        const deconflictedDefault = new Set();
        const deconflictedNamespace = new Set();
        for (const variable of [...this.exportNamesByVariable.keys(), ...this.imports]) {
            if (addNonNamespacesAndInteropHelpers || variable.isNamespace) {
                const module = variable.module;
                if (module instanceof ExternalModule) {
                    const chunk = this.externalChunkByModule.get(module);
                    dependencies.add(chunk);
                    if (addNonNamespacesAndInteropHelpers) {
                        if (variable.name === 'default') {
                            if (defaultInteropHelpersByInteropType[interop(module.id)]) {
                                deconflictedDefault.add(chunk);
                            }
                        }
                        else if (variable.isNamespace &&
                            namespaceInteropHelpersByInteropType[interop(module.id)] &&
                            (this.imports.has(variable) ||
                                !this.exportNamesByVariable.get(variable)?.every(name => name.startsWith('*')))) {
                            // We only need to deconflict it if the namespace is actually
                            // created as a variable, i.e. because it is used internally or
                            // because it is reexported as an object
                            deconflictedNamespace.add(chunk);
                        }
                    }
                }
                else {
                    const chunk = this.chunkByModule.get(module);
                    if (chunk !== this) {
                        dependencies.add(chunk);
                        if (addNonNamespacesAndInteropHelpers &&
                            chunk.exportMode === 'default' &&
                            variable.isNamespace) {
                            deconflictedNamespace.add(chunk);
                        }
                    }
                }
            }
        }
        if (addDependenciesWithoutBindings) {
            for (const dependency of this.dependencies) {
                dependencies.add(dependency);
            }
        }
        return { deconflictedDefault, deconflictedNamespace, dependencies };
    }
    getDynamicDependencies() {
        return this.getIncludedDynamicImports()
            .map(resolvedDynamicImport => resolvedDynamicImport.facadeChunk ||
            resolvedDynamicImport.chunk ||
            resolvedDynamicImport.externalChunk ||
            resolvedDynamicImport.resolution)
            .filter((resolution) => resolution !== this &&
            (resolution instanceof Chunk || resolution instanceof ExternalChunk));
    }
    getDynamicImportStringAndAttributes(resolution, fileName, node) {
        if (resolution instanceof ExternalModule) {
            const chunk = this.externalChunkByModule.get(resolution);
            return [`'${chunk.getImportPath(fileName)}'`, chunk.getImportAttributes(this.snippets)];
        }
        let attributes = null;
        if (['es', 'cjs'].includes(this.outputOptions.format) &&
            this.outputOptions.externalImportAttributes) {
            const attributesFromImportAttributes = getAttributesFromImportExpression(node);
            attributes =
                attributesFromImportAttributes === EMPTY_OBJECT
                    ? true
                    : formatAttributes(attributesFromImportAttributes, this.snippets);
        }
        return [resolution || '', attributes];
    }
    getFallbackChunkName() {
        if (this.manualChunkAlias) {
            return this.manualChunkAlias;
        }
        if (this.dynamicName) {
            return this.dynamicName;
        }
        if (this.fileName) {
            return getAliasName(this.fileName);
        }
        return getAliasName(this.orderedModules[this.orderedModules.length - 1].id);
    }
    getImportSpecifiers() {
        const { interop } = this.outputOptions;
        const importsByDependency = new Map();
        for (const variable of this.imports) {
            const module = variable.module;
            let dependency;
            let imported;
            if (module instanceof ExternalModule) {
                dependency = this.externalChunkByModule.get(module);
                imported = variable.name;
                if (imported !== 'default' && imported !== '*' && interop(module.id) === 'defaultOnly') {
                    return error(logUnexpectedNamedImport(module.id, imported, false));
                }
            }
            else {
                dependency = this.chunkByModule.get(module);
                imported = dependency.getVariableExportName(variable);
            }
            getOrCreate(importsByDependency, dependency, getNewArray).push({
                imported,
                local: variable.getName(this.snippets.getPropertyAccess)
            });
        }
        return importsByDependency;
    }
    getIncludedDynamicImports() {
        if (this.includedDynamicImports) {
            return this.includedDynamicImports;
        }
        const includedDynamicImports = [];
        for (const module of this.orderedModules) {
            for (const { node, resolution } of module.dynamicImports) {
                if (!node.included) {
                    continue;
                }
                includedDynamicImports.push(resolution instanceof Module
                    ? {
                        chunk: this.chunkByModule.get(resolution),
                        externalChunk: null,
                        facadeChunk: this.facadeChunkByModule.get(resolution),
                        node,
                        resolution
                    }
                    : resolution instanceof ExternalModule
                        ? {
                            chunk: null,
                            externalChunk: this.externalChunkByModule.get(resolution),
                            facadeChunk: null,
                            node,
                            resolution
                        }
                        : { chunk: null, externalChunk: null, facadeChunk: null, node, resolution });
            }
        }
        return (this.includedDynamicImports = includedDynamicImports);
    }
    getPreRenderedChunkInfo() {
        if (this.preRenderedChunkInfo) {
            return this.preRenderedChunkInfo;
        }
        const { dynamicEntryModules, facadeModule, implicitEntryModules, orderedModules } = this;
        return (this.preRenderedChunkInfo = {
            exports: this.getExportNames(),
            facadeModuleId: facadeModule && facadeModule.id,
            isDynamicEntry: dynamicEntryModules.length > 0,
            isEntry: !!facadeModule?.info.isEntry,
            isImplicitEntry: implicitEntryModules.length > 0,
            moduleIds: orderedModules.map(({ id }) => id),
            name: this.getChunkName(),
            type: 'chunk'
        });
    }
    getPreserveModulesChunkNameFromModule(module) {
        const predefinedChunkName = getPredefinedChunkNameFromModule(module);
        if (predefinedChunkName)
            return predefinedChunkName;
        const { preserveModulesRoot, sanitizeFileName } = this.outputOptions;
        const sanitizedId = sanitizeFileName(normalize(module.id.split(QUERY_HASH_REGEX, 1)[0]));
        const extensionName = extname(sanitizedId);
        const idWithoutExtension = NON_ASSET_EXTENSIONS.has(extensionName)
            ? sanitizedId.slice(0, -extensionName.length)
            : sanitizedId;
        if (isAbsolute(idWithoutExtension)) {
            if (preserveModulesRoot && resolve(idWithoutExtension).startsWith(preserveModulesRoot)) {
                return idWithoutExtension.slice(preserveModulesRoot.length).replace(/^[/\\]/, '');
            }
            else {
                // handle edge case in Windows
                if (this.inputBase === '/' && !idWithoutExtension.startsWith('/')) {
                    return relative(this.inputBase, idWithoutExtension.replace(/^[a-zA-Z]:[/\\]/, '/'));
                }
                return relative(this.inputBase, idWithoutExtension);
            }
        }
        else {
            return (this.outputOptions.virtualDirname.replace(/\/$/, '') + '/' + basename(idWithoutExtension));
        }
    }
    getReexportSpecifiers() {
        const { externalLiveBindings, interop } = this.outputOptions;
        const reexportSpecifiers = new Map();
        for (let exportName of this.getExportNames()) {
            let dependency;
            let imported;
            let needsLiveBinding = false;
            if (exportName[0] === '*') {
                const id = exportName.slice(1);
                if (interop(id) === 'defaultOnly') {
                    this.inputOptions.onLog(LOGLEVEL_WARN, logUnexpectedNamespaceReexport(id));
                }
                needsLiveBinding = externalLiveBindings;
                dependency = this.externalChunkByModule.get(this.modulesById.get(id));
                imported = exportName = '*';
            }
            else {
                const variable = this.exportsByName.get(exportName);
                if (variable instanceof SyntheticNamedExportVariable)
                    continue;
                const module = variable.module;
                if (module instanceof Module) {
                    dependency = this.chunkByModule.get(module);
                    if (dependency === this)
                        continue;
                    imported = dependency.getVariableExportName(variable);
                    needsLiveBinding = variable.isReassigned;
                }
                else {
                    dependency = this.externalChunkByModule.get(module);
                    imported = variable.name;
                    if (imported !== 'default' && imported !== '*' && interop(module.id) === 'defaultOnly') {
                        return error(logUnexpectedNamedImport(module.id, imported, true));
                    }
                    needsLiveBinding =
                        externalLiveBindings &&
                            (imported !== 'default' || isDefaultAProperty(interop(module.id), true));
                }
            }
            getOrCreate(reexportSpecifiers, dependency, getNewArray).push({
                imported,
                needsLiveBinding,
                reexported: exportName
            });
        }
        return reexportSpecifiers;
    }
    getReferencedFiles() {
        const referencedFiles = new Set();
        for (const module of this.orderedModules) {
            for (const meta of module.importMetas) {
                const fileName = meta.getReferencedFileName(this.pluginDriver);
                if (fileName) {
                    referencedFiles.add(fileName);
                }
            }
        }
        return [...referencedFiles];
    }
    getRenderedDependencies() {
        if (this.renderedDependencies) {
            return this.renderedDependencies;
        }
        const importSpecifiers = this.getImportSpecifiers();
        const reexportSpecifiers = this.getReexportSpecifiers();
        const renderedDependencies = new Map();
        const fileName = this.getFileName();
        for (const dependency of this.dependencies) {
            const imports = importSpecifiers.get(dependency) || null;
            const reexports = reexportSpecifiers.get(dependency) || null;
            const namedExportsMode = dependency instanceof ExternalChunk || dependency.exportMode !== 'default';
            const importPath = dependency.getImportPath(fileName);
            renderedDependencies.set(dependency, {
                attributes: dependency instanceof ExternalChunk
                    ? dependency.getImportAttributes(this.snippets)
                    : null,
                defaultVariableName: dependency.defaultVariableName,
                globalName: dependency instanceof ExternalChunk &&
                    (this.outputOptions.format === 'umd' || this.outputOptions.format === 'iife') &&
                    getGlobalName(dependency, this.outputOptions.globals, (imports || reexports) !== null, this.inputOptions.onLog),
                importPath,
                imports,
                isChunk: dependency instanceof Chunk,
                name: dependency.variableName,
                namedExportsMode,
                namespaceVariableName: dependency.namespaceVariableName,
                reexports
            });
        }
        return (this.renderedDependencies = renderedDependencies);
    }
    inlineChunkDependencies(chunk) {
        for (const dep of chunk.dependencies) {
            if (this.dependencies.has(dep))
                continue;
            this.dependencies.add(dep);
            if (dep instanceof Chunk) {
                this.inlineChunkDependencies(dep);
            }
        }
    }
    // This method changes properties on the AST before rendering and must not be async
    renderModules(fileName) {
        const { accessedGlobalsByScope, dependencies, exportNamesByVariable, includedNamespaces, inputOptions: { onLog }, isEmpty, orderedModules, outputOptions, pluginDriver, renderedModules, snippets } = this;
        const { compact, format, freeze, generatedCode: { symbols }, importAttributesKey } = outputOptions;
        const { _, cnst, n } = snippets;
        this.setDynamicImportResolutions(fileName);
        this.setImportMetaResolutions(fileName);
        this.setIdentifierRenderResolutions();
        const magicString = new MagicStringBundle({ separator: `${n}${n}` });
        const indent = getIndentString(orderedModules, outputOptions);
        const usedModules = [];
        let hoistedSource = '';
        const accessedGlobals = new Set();
        const renderedModuleSources = new Map();
        const renderOptions = {
            accessedDocumentCurrentScript: false,
            exportNamesByVariable,
            format,
            freeze,
            importAttributesKey,
            indent,
            pluginDriver,
            snippets,
            symbols,
            useOriginalName: null
        };
        let usesTopLevelAwait = false;
        for (const module of orderedModules) {
            let renderedLength = 0;
            let source;
            if (module.isIncluded() || includedNamespaces.has(module)) {
                const rendered = module.render(renderOptions);
                if (!renderOptions.accessedDocumentCurrentScript &&
                    formatsMaybeAccessDocumentCurrentScript.includes(format)) {
                    this.accessedGlobalsByScope.get(module.scope)?.delete(DOCUMENT_CURRENT_SCRIPT);
                }
                renderOptions.accessedDocumentCurrentScript = false;
                ({ source } = rendered);
                usesTopLevelAwait ||= rendered.usesTopLevelAwait;
                renderedLength = source.length();
                if (renderedLength) {
                    if (compact && source.lastLine().includes('//'))
                        source.append('\n');
                    renderedModuleSources.set(module, source);
                    magicString.addSource(source);
                    usedModules.push(module);
                }
                const namespace = module.namespace;
                if (includedNamespaces.has(module)) {
                    const rendered = namespace.renderBlock(renderOptions);
                    if (namespace.renderFirst())
                        hoistedSource += n + rendered;
                    else
                        magicString.addSource(new MagicString(rendered));
                }
                const accessedGlobalVariables = accessedGlobalsByScope.get(module.scope);
                if (accessedGlobalVariables) {
                    for (const name of accessedGlobalVariables) {
                        accessedGlobals.add(name);
                    }
                }
            }
            const { renderedExports, removedExports } = module.getRenderedExports();
            renderedModules[module.id] = {
                get code() {
                    return source?.toString() ?? null;
                },
                originalLength: module.originalCode.length,
                removedExports,
                renderedExports,
                renderedLength
            };
        }
        if (hoistedSource)
            magicString.prepend(hoistedSource + n + n);
        if (this.needsExportsShim) {
            magicString.prepend(`${n}${cnst} ${MISSING_EXPORT_SHIM_VARIABLE}${_}=${_}void 0;${n}${n}`);
        }
        const renderedSource = compact ? magicString : magicString.trim();
        if (isEmpty && this.getExportNames().length === 0 && dependencies.size === 0) {
            onLog(LOGLEVEL_WARN, logEmptyChunk(this.getChunkName()));
        }
        return { accessedGlobals, indent, magicString, renderedSource, usedModules, usesTopLevelAwait };
    }
    setDynamicImportResolutions(fileName) {
        const { accessedGlobalsByScope, outputOptions, pluginDriver, snippets } = this;
        for (const resolvedDynamicImport of this.getIncludedDynamicImports()) {
            if (resolvedDynamicImport.chunk) {
                const { chunk, facadeChunk, node, resolution } = resolvedDynamicImport;
                if (chunk === this) {
                    node.setInternalResolution(resolution.namespace);
                }
                else {
                    node.setExternalResolution((facadeChunk || chunk).exportMode, resolution, outputOptions, snippets, pluginDriver, accessedGlobalsByScope, `'${(facadeChunk || chunk).getImportPath(fileName)}'`, !facadeChunk?.strictFacade && chunk.exportNamesByVariable.get(resolution.namespace)[0], null, this, facadeChunk || chunk);
                }
            }
            else {
                const { node, resolution } = resolvedDynamicImport;
                const [resolutionString, attributes] = this.getDynamicImportStringAndAttributes(resolution, fileName, node);
                node.setExternalResolution('external', resolution, outputOptions, snippets, pluginDriver, accessedGlobalsByScope, resolutionString, false, attributes, this, null);
            }
        }
    }
    setIdentifierRenderResolutions() {
        const { format, generatedCode: { symbols }, interop, preserveModules, externalLiveBindings } = this.outputOptions;
        const syntheticExports = new Set();
        for (const exportName of this.getExportNames()) {
            const exportVariable = this.exportsByName.get(exportName);
            if (format !== 'es' &&
                format !== 'system' &&
                exportVariable.isReassigned &&
                !exportVariable.isId) {
                exportVariable.setRenderNames('exports', exportName);
            }
            else if (exportVariable instanceof SyntheticNamedExportVariable) {
                syntheticExports.add(exportVariable);
            }
            else {
                exportVariable.setRenderNames(null, null);
            }
        }
        for (const module of this.orderedModules) {
            if (module.needsExportShim) {
                this.needsExportsShim = true;
                break;
            }
        }
        const usedNames = new Set(['Object', 'Promise']);
        if (this.needsExportsShim) {
            usedNames.add(MISSING_EXPORT_SHIM_VARIABLE);
        }
        if (symbols) {
            usedNames.add('Symbol');
        }
        switch (format) {
            case 'system': {
                usedNames.add('module').add('exports');
                break;
            }
            case 'es': {
                break;
            }
            case 'cjs': {
                usedNames.add('module').add('require').add('__filename').add('__dirname');
            }
            // fallthrough
            default: {
                usedNames.add('exports');
                for (const helper of HELPER_NAMES) {
                    usedNames.add(helper);
                }
            }
        }
        deconflictChunk(this.orderedModules, this.getDependenciesToBeDeconflicted(format !== 'es' && format !== 'system', format === 'amd' || format === 'umd' || format === 'iife', interop), this.imports, usedNames, format, interop, preserveModules, externalLiveBindings, this.chunkByModule, this.externalChunkByModule, syntheticExports, this.exportNamesByVariable, this.accessedGlobalsByScope, this.includedNamespaces);
    }
    setImportMetaResolutions(fileName) {
        const { accessedGlobalsByScope, includedNamespaces, orderedModules, outputOptions: { format } } = this;
        for (const module of orderedModules) {
            for (const importMeta of module.importMetas) {
                importMeta.setResolution(format, accessedGlobalsByScope, fileName);
            }
            if (includedNamespaces.has(module)) {
                module.namespace.prepare(accessedGlobalsByScope);
            }
        }
    }
    setUpChunkImportsAndExportsForModule(module) {
        const moduleImports = new Set(module.includedImports);
        // when we are not preserving modules, we need to make all namespace variables available for
        // rendering the namespace object
        if (!this.outputOptions.preserveModules && this.includedNamespaces.has(module)) {
            const memberVariables = module.namespace.getMemberVariables();
            for (const variable of Object.values(memberVariables)) {
                if (variable.included) {
                    moduleImports.add(variable);
                }
            }
        }
        for (let variable of moduleImports) {
            if (variable instanceof ExportDefaultVariable) {
                variable = variable.getOriginalVariable();
            }
            if (variable instanceof SyntheticNamedExportVariable) {
                variable = variable.getBaseVariable();
            }
            const chunk = this.chunkByModule.get(variable.module);
            if (chunk !== this) {
                this.imports.add(variable);
                if (variable.module instanceof Module) {
                    this.checkCircularDependencyImport(variable, module);
                    // When preserving modules, we do not create namespace objects but directly
                    // use the actual namespaces, which would be broken by this logic.
                    if (!(variable instanceof NamespaceVariable && this.outputOptions.preserveModules)) {
                        chunk.exports.add(variable);
                    }
                }
            }
        }
        if (this.includedNamespaces.has(module) ||
            (module.info.isEntry && module.preserveSignature !== false) ||
            module.includedDynamicImporters.some(importer => this.chunkByModule.get(importer) !== this)) {
            this.ensureReexportsAreAvailableForModule(module);
        }
        for (const { node, resolution } of module.dynamicImports) {
            if (node.included &&
                resolution instanceof Module &&
                this.chunkByModule.get(resolution) === this &&
                !this.includedNamespaces.has(resolution)) {
                this.includedNamespaces.add(resolution);
                this.ensureReexportsAreAvailableForModule(resolution);
            }
        }
    }
}
function getChunkNameFromModule(module) {
    return getPredefinedChunkNameFromModule(module) ?? getAliasName(module.id);
}
function getPredefinedChunkNameFromModule(module) {
    return (module.chunkNames.find(({ isUserDefined }) => isUserDefined)?.name ?? module.chunkNames[0]?.name);
}
function getImportedBindingsPerDependency(renderedDependencies, resolveFileName) {
    const importedBindingsPerDependency = {};
    for (const [dependency, declaration] of renderedDependencies) {
        const specifiers = new Set();
        if (declaration.imports) {
            for (const { imported } of declaration.imports) {
                specifiers.add(imported);
            }
        }
        if (declaration.reexports) {
            for (const { imported } of declaration.reexports) {
                specifiers.add(imported);
            }
        }
        importedBindingsPerDependency[resolveFileName(dependency)] = [...specifiers];
    }
    return importedBindingsPerDependency;
}
const QUERY_HASH_REGEX = /[#?]/;
const resolveFileName = (dependency) => dependency.getFileName();
