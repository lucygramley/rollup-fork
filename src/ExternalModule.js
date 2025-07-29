import ExternalVariable from './ast/variables/ExternalVariable';
import { EMPTY_ARRAY } from './utils/blank';
import { cacheObjectGetters } from './utils/getter';
import { makeLegal } from './utils/identifierHelpers';
import { LOGLEVEL_WARN } from './utils/logging';
import { logUnusedExternalImports } from './utils/logs';
export default class ExternalModule {
    constructor(options, id, moduleSideEffects, meta, renormalizeRenderPath, attributes) {
        this.options = options;
        this.id = id;
        this.renormalizeRenderPath = renormalizeRenderPath;
        this.dynamicImporters = [];
        this.execIndex = Infinity;
        this.exportedVariables = new Map();
        this.importers = [];
        this.reexported = false;
        this.used = false;
        this.declarations = new Map();
        this.mostCommonSuggestion = 0;
        this.nameSuggestions = new Map();
        this.suggestedVariableName = makeLegal(id.split(/[/\\]/).pop());
        const { importers, dynamicImporters } = this;
        this.info = {
            ast: null,
            attributes,
            code: null,
            dynamicallyImportedIdResolutions: EMPTY_ARRAY,
            dynamicallyImportedIds: EMPTY_ARRAY,
            get dynamicImporters() {
                return dynamicImporters.sort();
            },
            exportedBindings: null,
            exports: null,
            hasDefaultExport: null,
            id,
            implicitlyLoadedAfterOneOf: EMPTY_ARRAY,
            implicitlyLoadedBefore: EMPTY_ARRAY,
            importedIdResolutions: EMPTY_ARRAY,
            importedIds: EMPTY_ARRAY,
            get importers() {
                return importers.sort();
            },
            isEntry: false,
            isExternal: true,
            isIncluded: null,
            meta,
            moduleSideEffects,
            syntheticNamedExports: false
        };
    }
    cacheInfoGetters() {
        cacheObjectGetters(this.info, ['dynamicImporters', 'importers']);
    }
    getVariableForExportName(name) {
        const declaration = this.declarations.get(name);
        if (declaration)
            return [declaration];
        const externalVariable = new ExternalVariable(this, name);
        this.declarations.set(name, externalVariable);
        this.exportedVariables.set(externalVariable, name);
        return [externalVariable];
    }
    suggestName(name) {
        const value = (this.nameSuggestions.get(name) ?? 0) + 1;
        this.nameSuggestions.set(name, value);
        if (value > this.mostCommonSuggestion) {
            this.mostCommonSuggestion = value;
            this.suggestedVariableName = name;
        }
    }
    warnUnusedImports() {
        const unused = [...this.declarations]
            .filter(([name, declaration]) => name !== '*' && !declaration.included && !this.reexported && !declaration.referenced)
            .map(([name]) => name);
        if (unused.length === 0)
            return;
        const importersSet = new Set();
        for (const name of unused) {
            for (const importer of this.declarations.get(name).module.importers) {
                importersSet.add(importer);
            }
        }
        const importersArray = [...importersSet];
        this.options.onLog(LOGLEVEL_WARN, logUnusedExternalImports(this.id, unused, importersArray));
    }
}
