import { escapeId } from '../../utils/escapeId';
import { DOCUMENT_CURRENT_SCRIPT } from '../../utils/interopHelpers';
import { dirname, normalize, relative } from '../../utils/path';
import { INTERACTION_ACCESSED } from '../NodeInteractions';
import MemberExpression from './MemberExpression';
import { NodeBase } from './shared/Node';
const FILE_PREFIX = 'ROLLUP_FILE_URL_';
const IMPORT = 'import';
export default class MetaProperty extends NodeBase {
    constructor() {
        super(...arguments);
        this.metaProperty = null;
        this.preliminaryChunkId = null;
        this.referenceId = null;
    }
    getReferencedFileName(outputPluginDriver) {
        const { meta: { name }, metaProperty } = this;
        if (name === IMPORT && metaProperty?.startsWith(FILE_PREFIX)) {
            return outputPluginDriver.getFileName(metaProperty.slice(FILE_PREFIX.length));
        }
        return null;
    }
    hasEffects() {
        return false;
    }
    hasEffectsOnInteractionAtPath(path, { type }) {
        return path.length > 1 || type !== INTERACTION_ACCESSED;
    }
    include() {
        if (!this.included)
            this.includeNode();
    }
    includeNode() {
        this.included = true;
        if (this.meta.name === IMPORT) {
            this.scope.context.addImportMeta(this);
            const parent = this.parent;
            const metaProperty = (this.metaProperty =
                parent instanceof MemberExpression && typeof parent.propertyKey === 'string'
                    ? parent.propertyKey
                    : null);
            if (metaProperty?.startsWith(FILE_PREFIX)) {
                this.referenceId = metaProperty.slice(FILE_PREFIX.length);
            }
        }
    }
    render(code, renderOptions) {
        const { format, pluginDriver, snippets } = renderOptions;
        const { scope: { context: { module } }, meta: { name }, metaProperty, parent, preliminaryChunkId, referenceId, start, end } = this;
        const { id: moduleId } = module;
        if (name !== IMPORT)
            return;
        const chunkId = preliminaryChunkId;
        if (referenceId) {
            const fileName = pluginDriver.getFileName(referenceId);
            const relativePath = normalize(relative(dirname(chunkId), fileName));
            const replacement = pluginDriver.hookFirstSync('resolveFileUrl', [
                { chunkId, fileName, format, moduleId, referenceId, relativePath }
            ]) || relativeUrlMechanisms[format](relativePath);
            code.overwrite(parent.start, parent.end, replacement, { contentOnly: true });
            return;
        }
        let replacement = pluginDriver.hookFirstSync('resolveImportMeta', [
            metaProperty,
            { chunkId, format, moduleId }
        ]);
        if (!replacement) {
            replacement = importMetaMechanisms[format]?.(metaProperty, { chunkId, snippets });
            renderOptions.accessedDocumentCurrentScript ||=
                formatsMaybeAccessDocumentCurrentScript.includes(format) && replacement !== 'undefined';
        }
        if (typeof replacement === 'string') {
            if (parent instanceof MemberExpression) {
                code.overwrite(parent.start, parent.end, replacement, { contentOnly: true });
            }
            else {
                code.overwrite(start, end, replacement, { contentOnly: true });
            }
        }
    }
    setResolution(format, accessedGlobalsByScope, preliminaryChunkId) {
        this.preliminaryChunkId = preliminaryChunkId;
        const accessedGlobals = (this.metaProperty?.startsWith(FILE_PREFIX) ? accessedFileUrlGlobals : accessedMetaUrlGlobals)[format];
        if (accessedGlobals.length > 0) {
            this.scope.addAccessedGlobals(accessedGlobals, accessedGlobalsByScope);
        }
    }
}
export const formatsMaybeAccessDocumentCurrentScript = ['cjs', 'iife', 'umd'];
const accessedMetaUrlGlobals = {
    amd: ['document', 'module', 'URL'],
    cjs: ['document', 'require', 'URL', DOCUMENT_CURRENT_SCRIPT],
    es: [],
    iife: ['document', 'URL', DOCUMENT_CURRENT_SCRIPT],
    system: ['module'],
    umd: ['document', 'require', 'URL', DOCUMENT_CURRENT_SCRIPT]
};
const accessedFileUrlGlobals = {
    amd: ['document', 'require', 'URL'],
    cjs: ['document', 'require', 'URL'],
    es: [],
    iife: ['document', 'URL'],
    system: ['module', 'URL'],
    umd: ['document', 'require', 'URL']
};
const getResolveUrl = (path, URL = 'URL') => `new ${URL}(${path}).href`;
const getRelativeUrlFromDocument = (relativePath, umd = false) => getResolveUrl(`'${escapeId(relativePath)}', ${umd ? `typeof document === 'undefined' ? location.href : ` : ''}document.currentScript && document.currentScript.tagName.toUpperCase() === 'SCRIPT' && document.currentScript.src || document.baseURI`);
const getGenericImportMetaMechanism = (getUrl) => (property, { chunkId }) => {
    const urlMechanism = getUrl(chunkId);
    return property === null
        ? `({ url: ${urlMechanism} })`
        : property === 'url'
            ? urlMechanism
            : 'undefined';
};
const getFileUrlFromFullPath = (path) => `require('u' + 'rl').pathToFileURL(${path}).href`;
const getFileUrlFromRelativePath = (path) => getFileUrlFromFullPath(`__dirname + '/${escapeId(path)}'`);
const getUrlFromDocument = (chunkId, umd = false) => `${umd ? `typeof document === 'undefined' ? location.href : ` : ''}(${DOCUMENT_CURRENT_SCRIPT} && ${DOCUMENT_CURRENT_SCRIPT}.tagName.toUpperCase() === 'SCRIPT' && ${DOCUMENT_CURRENT_SCRIPT}.src || new URL('${escapeId(chunkId)}', document.baseURI).href)`;
const relativeUrlMechanisms = {
    amd: relativePath => {
        if (relativePath[0] !== '.')
            relativePath = './' + relativePath;
        return getResolveUrl(`require.toUrl('${escapeId(relativePath)}'), document.baseURI`);
    },
    cjs: relativePath => `(typeof document === 'undefined' ? ${getFileUrlFromRelativePath(relativePath)} : ${getRelativeUrlFromDocument(relativePath)})`,
    es: relativePath => getResolveUrl(`'${escapeId(relativePath)}', import.meta.url`),
    iife: relativePath => getRelativeUrlFromDocument(relativePath),
    system: relativePath => getResolveUrl(`'${escapeId(relativePath)}', module.meta.url`),
    umd: relativePath => `(typeof document === 'undefined' && typeof location === 'undefined' ? ${getFileUrlFromRelativePath(relativePath)} : ${getRelativeUrlFromDocument(relativePath, true)})`
};
const importMetaMechanisms = {
    amd: getGenericImportMetaMechanism(() => getResolveUrl(`module.uri, document.baseURI`)),
    cjs: getGenericImportMetaMechanism(chunkId => `(typeof document === 'undefined' ? ${getFileUrlFromFullPath('__filename')} : ${getUrlFromDocument(chunkId)})`),
    iife: getGenericImportMetaMechanism(chunkId => getUrlFromDocument(chunkId)),
    system: (property, { snippets: { getPropertyAccess } }) => property === null ? `module.meta` : `module.meta${getPropertyAccess(property)}`,
    umd: getGenericImportMetaMechanism(chunkId => `(typeof document === 'undefined' && typeof location === 'undefined' ? ${getFileUrlFromFullPath('__filename')} : ${getUrlFromDocument(chunkId, true)})`)
};
