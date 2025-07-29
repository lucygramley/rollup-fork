import { stringifyIdentifierIfNeeded } from '../utils/identifierHelpers';
import { getHelpersBlock } from '../utils/interopHelpers';
export default function es(magicString, { accessedGlobals, indent: t, intro, outro, dependencies, exports, snippets }, { externalLiveBindings, freeze, generatedCode: { symbols }, importAttributesKey }) {
    const { n } = snippets;
    const importBlock = getImportBlock(dependencies, importAttributesKey, snippets);
    if (importBlock.length > 0)
        intro += importBlock.join(n) + n + n;
    intro += getHelpersBlock(null, accessedGlobals, t, snippets, externalLiveBindings, freeze, symbols);
    if (intro)
        magicString.prepend(intro);
    const exportBlock = getExportBlock(exports, snippets);
    if (exportBlock.length > 0)
        magicString.append(n + n + exportBlock.join(n).trim());
    if (outro)
        magicString.append(outro);
    magicString.trim();
}
function getImportBlock(dependencies, importAttributesKey, { _ }) {
    const importBlock = [];
    for (const { importPath, reexports, imports, name, attributes } of dependencies) {
        const assertion = attributes ? `${_}${importAttributesKey}${_}${attributes}` : '';
        const pathWithAssertion = `'${importPath}'${assertion};`;
        if (!reexports && !imports) {
            importBlock.push(`import${_}${pathWithAssertion}`);
            continue;
        }
        if (imports) {
            let defaultImport = null;
            let starImport = null;
            const importedNames = [];
            for (const specifier of imports) {
                if (specifier.imported === 'default') {
                    defaultImport = specifier;
                }
                else if (specifier.imported === '*') {
                    starImport = specifier;
                }
                else {
                    importedNames.push(specifier);
                }
            }
            if (starImport) {
                importBlock.push(`import${_}*${_}as ${starImport.local} from${_}${pathWithAssertion}`);
            }
            if (defaultImport && importedNames.length === 0) {
                importBlock.push(`import ${defaultImport.local} from${_}${pathWithAssertion}`);
            }
            else if (importedNames.length > 0) {
                importBlock.push(`import ${defaultImport ? `${defaultImport.local},${_}` : ''}{${_}${importedNames
                    .map(specifier => specifier.imported === specifier.local
                    ? specifier.imported
                    : `${stringifyIdentifierIfNeeded(specifier.imported)} as ${specifier.local}`)
                    .join(`,${_}`)}${_}}${_}from${_}${pathWithAssertion}`);
            }
        }
        if (reexports) {
            let starExport = null;
            const namespaceReexports = [];
            const namedReexports = [];
            for (const specifier of reexports) {
                if (specifier.reexported === '*') {
                    starExport = specifier;
                }
                else if (specifier.imported === '*') {
                    namespaceReexports.push(specifier);
                }
                else {
                    namedReexports.push(specifier);
                }
            }
            if (starExport) {
                importBlock.push(`export${_}*${_}from${_}${pathWithAssertion}`);
            }
            if (namespaceReexports.length > 0) {
                if (!imports ||
                    !imports.some(specifier => specifier.imported === '*' && specifier.local === name)) {
                    importBlock.push(`import${_}*${_}as ${name} from${_}${pathWithAssertion}`);
                }
                for (const specifier of namespaceReexports) {
                    importBlock.push(`export${_}{${_}${name === specifier.reexported
                        ? name
                        : `${name} as ${stringifyIdentifierIfNeeded(specifier.reexported)}`} };`);
                }
            }
            if (namedReexports.length > 0) {
                importBlock.push(`export${_}{${_}${namedReexports
                    .map(specifier => specifier.imported === specifier.reexported
                    ? stringifyIdentifierIfNeeded(specifier.imported)
                    : `${stringifyIdentifierIfNeeded(specifier.imported)} as ${stringifyIdentifierIfNeeded(specifier.reexported)}`)
                    .join(`,${_}`)}${_}}${_}from${_}${pathWithAssertion}`);
            }
        }
    }
    return importBlock;
}
function getExportBlock(exports, { _, cnst }) {
    const exportBlock = [];
    const exportDeclaration = new Array(exports.length);
    let index = 0;
    for (const specifier of exports) {
        if (specifier.expression) {
            exportBlock.push(`${cnst} ${specifier.local}${_}=${_}${specifier.expression};`);
        }
        exportDeclaration[index++] =
            specifier.exported === specifier.local
                ? specifier.local
                : `${specifier.local} as ${stringifyIdentifierIfNeeded(specifier.exported)}`;
    }
    if (exportDeclaration.length > 0) {
        exportBlock.push(`export${_}{${_}${exportDeclaration.join(`,${_}`)}${_}};`);
    }
    return exportBlock;
}
