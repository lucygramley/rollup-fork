import { escapeId } from './utils/escapeId';
import { normalize, relative } from './utils/path';
import { getImportPath } from './utils/relativeId';
export default class ExternalChunk {
    constructor(module, options, inputBase) {
        this.options = options;
        this.inputBase = inputBase;
        this.defaultVariableName = '';
        this.namespaceVariableName = '';
        this.variableName = '';
        this.fileName = null;
        this.importAttributes = null;
        this.id = module.id;
        this.moduleInfo = module.info;
        this.renormalizeRenderPath = module.renormalizeRenderPath;
        this.suggestedVariableName = module.suggestedVariableName;
    }
    getFileName() {
        if (this.fileName) {
            return this.fileName;
        }
        const { paths } = this.options;
        return (this.fileName =
            (typeof paths === 'function' ? paths(this.id) : paths[this.id]) ||
                (this.renormalizeRenderPath ? normalize(relative(this.inputBase, this.id)) : this.id));
    }
    getImportAttributes(snippets) {
        return (this.importAttributes ||= formatAttributes(['es', 'cjs'].includes(this.options.format) &&
            this.options.externalImportAttributes &&
            this.moduleInfo.attributes, snippets));
    }
    getImportPath(importer) {
        return escapeId(this.renormalizeRenderPath
            ? getImportPath(importer, this.getFileName(), this.options.format === 'amd', false)
            : this.getFileName());
    }
}
export function formatAttributes(attributes, { getObject }) {
    if (!attributes) {
        return null;
    }
    const assertionEntries = Object.entries(attributes).map(([key, value]) => [key, `'${value}'`]);
    if (assertionEntries.length > 0) {
        return getObject(assertionEntries, { lineBreakIndent: null });
    }
    return null;
}
