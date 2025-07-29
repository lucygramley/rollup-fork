import ExternalChunk from '../../ExternalChunk';
import ExternalModule from '../../ExternalModule';
import { EMPTY_ARRAY } from '../../utils/blank';
import { INTEROP_NAMESPACE_DEFAULT_ONLY_VARIABLE, namespaceInteropHelpersByInteropType } from '../../utils/interopHelpers';
import { findFirstOccurrenceOutsideComment } from '../../utils/renderHelpers';
import { UnknownKey } from '../utils/PathTracker';
import ArrowFunctionExpression from './ArrowFunctionExpression';
import AwaitExpression from './AwaitExpression';
import CallExpression from './CallExpression';
import ExpressionStatement from './ExpressionStatement';
import FunctionExpression from './FunctionExpression';
import Identifier from './Identifier';
import MemberExpression from './MemberExpression';
import ObjectPattern from './ObjectPattern';
import { isFlagSet, setFlag } from './shared/BitFlags';
import FunctionNode from './shared/FunctionNode';
import { doNotDeoptimize, NodeBase } from './shared/Node';
import VariableDeclarator from './VariableDeclarator';
function getChunkInfoWithPath(chunk) {
    return { fileName: chunk.getFileName(), ...chunk.getPreRenderedChunkInfo() };
}
export default class ImportExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.inlineNamespace = null;
        this.hasUnknownAccessedKey = false;
        this.accessedPropKey = new Set();
        this.attributes = null;
        this.mechanism = null;
        this.namespaceExportName = undefined;
        this.resolution = null;
        this.resolutionString = null;
    }
    get withinTopLevelAwait() {
        return isFlagSet(this.flags, 134217728 /* Flag.withinTopLevelAwait */);
    }
    set withinTopLevelAwait(value) {
        this.flags = setFlag(this.flags, 134217728 /* Flag.withinTopLevelAwait */, value);
    }
    // Do not bind attributes
    bind() {
        this.source.bind();
    }
    /**
     * Get imported variables for deterministic usage, valid cases are:
     *
     * 1. `const { foo } = await import('bar')`.
     * 2. `(await import('bar')).foo`
     * 3. `import('bar').then(({ foo }) => {})`
     *
     * Returns empty array if it's side-effect only import.
     * Returns undefined if it's not fully deterministic.
     */
    getDeterministicImportedNames() {
        const parent1 = this.parent;
        // Side-effect only: import('bar')
        if (parent1 instanceof ExpressionStatement) {
            return EMPTY_ARRAY;
        }
        if (parent1 instanceof AwaitExpression) {
            const parent2 = parent1.parent;
            // Side-effect only: await import('bar')
            if (parent2 instanceof ExpressionStatement) {
                return EMPTY_ARRAY;
            }
            // Case 1: const { foo } / module = await import('bar')
            if (parent2 instanceof VariableDeclarator) {
                const declaration = parent2.id;
                if (declaration instanceof Identifier) {
                    return this.hasUnknownAccessedKey ? undefined : [...this.accessedPropKey];
                }
                if (declaration instanceof ObjectPattern) {
                    return getDeterministicObjectDestructure(declaration);
                }
            }
            // Case 2: (await import('bar')).foo
            if (parent2 instanceof MemberExpression) {
                const id = parent2.property;
                if (!parent2.computed && id instanceof Identifier) {
                    return [id.name];
                }
            }
            return;
        }
        if (parent1 instanceof MemberExpression) {
            const callExpression = parent1.parent;
            const property = parent1.property;
            if (!(callExpression instanceof CallExpression) || !(property instanceof Identifier)) {
                return;
            }
            const memberName = property.name;
            // side-effect only, when only chaining .catch or .finally
            if (callExpression.parent instanceof ExpressionStatement &&
                ['catch', 'finally'].includes(memberName)) {
                return EMPTY_ARRAY;
            }
            if (memberName !== 'then')
                return;
            // Side-effect only: import('bar').then()
            if (callExpression.arguments.length === 0) {
                return EMPTY_ARRAY;
            }
            const thenCallback = callExpression.arguments[0];
            if (callExpression.arguments.length !== 1 ||
                !(thenCallback instanceof ArrowFunctionExpression ||
                    thenCallback instanceof FunctionExpression)) {
                return;
            }
            // Side-effect only: import('bar').then(() => {})
            if (thenCallback.params.length === 0) {
                return EMPTY_ARRAY;
            }
            const declaration = thenCallback.params[0];
            if (thenCallback.params.length === 1 && declaration instanceof ObjectPattern) {
                return getDeterministicObjectDestructure(declaration);
            }
            return this.hasUnknownAccessedKey ? undefined : [...this.accessedPropKey];
        }
    }
    hasEffects() {
        return true;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode();
        this.source.include(context, includeChildrenRecursively);
    }
    includeNode() {
        this.included = true;
        this.scope.context.includeDynamicImport(this);
        this.scope.addAccessedDynamicImport(this);
    }
    includePath(path) {
        if (!this.included)
            this.includeNode();
        // Technically, this is not correct as dynamic imports return a Promise.
        if (this.hasUnknownAccessedKey)
            return;
        if (path[0] === UnknownKey) {
            this.hasUnknownAccessedKey = true;
        }
        else if (typeof path[0] === 'string') {
            this.accessedPropKey.add(path[0]);
        }
        // Update included paths
        this.scope.context.includeDynamicImport(this);
    }
    initialise() {
        super.initialise();
        this.scope.context.addDynamicImport(this);
        let parent = this.parent;
        let withinAwaitExpression = false;
        let withinTopLevelAwait = false;
        do {
            if (withinAwaitExpression &&
                (parent instanceof FunctionNode || parent instanceof ArrowFunctionExpression)) {
                withinTopLevelAwait = false;
            }
            if (parent instanceof AwaitExpression) {
                withinAwaitExpression = true;
                withinTopLevelAwait = true;
            }
        } while ((parent = parent.parent));
        if (withinAwaitExpression && withinTopLevelAwait) {
            this.withinTopLevelAwait = true;
        }
    }
    parseNode(esTreeNode) {
        this.sourceAstNode = esTreeNode.source;
        return super.parseNode(esTreeNode);
    }
    render(code, options) {
        const { snippets: { _, getDirectReturnFunction, getObject, getPropertyAccess }, importAttributesKey } = options;
        if (this.inlineNamespace) {
            const [left, right] = getDirectReturnFunction([], {
                functionReturn: true,
                lineBreakIndent: null,
                name: null
            });
            code.overwrite(this.start, this.end, `Promise.resolve().then(${left}${this.inlineNamespace.getName(getPropertyAccess)}${right})`);
            return;
        }
        if (this.mechanism) {
            code.overwrite(this.start, findFirstOccurrenceOutsideComment(code.original, '(', this.start + 6) + 1, this.mechanism.left);
            code.overwrite(this.end - 1, this.end, this.mechanism.right);
        }
        if (this.resolutionString) {
            code.overwrite(this.source.start, this.source.end, this.resolutionString);
            if (this.namespaceExportName) {
                const [left, right] = getDirectReturnFunction(['n'], {
                    functionReturn: true,
                    lineBreakIndent: null,
                    name: null
                });
                code.prependLeft(this.end, `.then(${left}n.${this.namespaceExportName}${right})`);
            }
        }
        else {
            this.source.render(code, options);
        }
        if (this.attributes !== true) {
            if (this.options) {
                code.overwrite(this.source.end, this.end - 1, '', { contentOnly: true });
            }
            if (this.attributes) {
                code.appendLeft(this.end - 1, `,${_}${getObject([[importAttributesKey, this.attributes]], {
                    lineBreakIndent: null
                })}`);
            }
        }
    }
    setExternalResolution(exportMode, resolution, options, snippets, pluginDriver, accessedGlobalsByScope, resolutionString, namespaceExportName, attributes, ownChunk, targetChunk) {
        const { format } = options;
        this.inlineNamespace = null;
        this.resolution = resolution;
        this.resolutionString = resolutionString;
        this.namespaceExportName = namespaceExportName;
        this.attributes = attributes;
        const accessedGlobals = [...(accessedImportGlobals[format] || [])];
        let helper;
        ({ helper, mechanism: this.mechanism } = this.getDynamicImportMechanismAndHelper(resolution, exportMode, options, snippets, pluginDriver, ownChunk, targetChunk));
        if (helper) {
            accessedGlobals.push(helper);
        }
        if (accessedGlobals.length > 0) {
            this.scope.addAccessedGlobals(accessedGlobals, accessedGlobalsByScope);
        }
    }
    setInternalResolution(inlineNamespace) {
        this.inlineNamespace = inlineNamespace;
    }
    getDynamicImportMechanismAndHelper(resolution, exportMode, { compact, dynamicImportInCjs, format, generatedCode: { arrowFunctions }, interop }, { _, getDirectReturnFunction, getDirectReturnIifeLeft }, pluginDriver, ownChunk, targetChunk) {
        const mechanism = pluginDriver.hookFirstSync('renderDynamicImport', [
            {
                chunk: getChunkInfoWithPath(ownChunk),
                customResolution: typeof this.resolution === 'string' ? this.resolution : null,
                format,
                getTargetChunkImports() {
                    if (targetChunk === null)
                        return null;
                    const chunkInfos = [];
                    const importerPath = ownChunk.getFileName();
                    for (const dep of targetChunk.dependencies) {
                        const resolvedImportPath = `'${dep.getImportPath(importerPath)}'`;
                        if (dep instanceof ExternalChunk) {
                            chunkInfos.push({
                                fileName: dep.getFileName(),
                                resolvedImportPath,
                                type: 'external'
                            });
                        }
                        else {
                            chunkInfos.push({
                                chunk: dep.getPreRenderedChunkInfo(),
                                fileName: dep.getFileName(),
                                resolvedImportPath,
                                type: 'internal'
                            });
                        }
                    }
                    return chunkInfos;
                },
                moduleId: this.scope.context.module.id,
                targetChunk: targetChunk ? getChunkInfoWithPath(targetChunk) : null,
                targetModuleId: this.resolution && typeof this.resolution !== 'string' ? this.resolution.id : null
            }
        ]);
        if (mechanism) {
            return { helper: null, mechanism };
        }
        const hasDynamicTarget = !this.resolution || typeof this.resolution === 'string';
        switch (format) {
            case 'cjs': {
                if (dynamicImportInCjs &&
                    (!resolution || typeof resolution === 'string' || resolution instanceof ExternalModule)) {
                    return { helper: null, mechanism: null };
                }
                const helper = getInteropHelper(resolution, exportMode, interop);
                let left = `require(`;
                let right = `)`;
                if (helper) {
                    left = `/*#__PURE__*/${helper}(${left}`;
                    right += ')';
                }
                const [functionLeft, functionRight] = getDirectReturnFunction([], {
                    functionReturn: true,
                    lineBreakIndent: null,
                    name: null
                });
                left = `Promise.resolve().then(${functionLeft}${left}`;
                right += `${functionRight})`;
                if (!arrowFunctions && hasDynamicTarget) {
                    left = getDirectReturnIifeLeft(['t'], `${left}t${right}`, {
                        needsArrowReturnParens: false,
                        needsWrappedFunction: true
                    });
                    right = ')';
                }
                return {
                    helper,
                    mechanism: { left, right }
                };
            }
            case 'amd': {
                const resolve = compact ? 'c' : 'resolve';
                const reject = compact ? 'e' : 'reject';
                const helper = getInteropHelper(resolution, exportMode, interop);
                const [resolveLeft, resolveRight] = getDirectReturnFunction(['m'], {
                    functionReturn: false,
                    lineBreakIndent: null,
                    name: null
                });
                const resolveNamespace = helper
                    ? `${resolveLeft}${resolve}(/*#__PURE__*/${helper}(m))${resolveRight}`
                    : resolve;
                const [handlerLeft, handlerRight] = getDirectReturnFunction([resolve, reject], {
                    functionReturn: false,
                    lineBreakIndent: null,
                    name: null
                });
                let left = `new Promise(${handlerLeft}require([`;
                let right = `],${_}${resolveNamespace},${_}${reject})${handlerRight})`;
                if (!arrowFunctions && hasDynamicTarget) {
                    left = getDirectReturnIifeLeft(['t'], `${left}t${right}`, {
                        needsArrowReturnParens: false,
                        needsWrappedFunction: true
                    });
                    right = ')';
                }
                return {
                    helper,
                    mechanism: { left, right }
                };
            }
            case 'system': {
                return {
                    helper: null,
                    mechanism: {
                        left: 'module.import(',
                        right: ')'
                    }
                };
            }
        }
        return { helper: null, mechanism: null };
    }
}
ImportExpression.prototype.applyDeoptimizations = doNotDeoptimize;
function getInteropHelper(resolution, exportMode, interop) {
    return exportMode === 'external'
        ? namespaceInteropHelpersByInteropType[interop(resolution instanceof ExternalModule ? resolution.id : null)]
        : exportMode === 'default'
            ? INTEROP_NAMESPACE_DEFAULT_ONLY_VARIABLE
            : null;
}
const accessedImportGlobals = {
    amd: ['require'],
    cjs: ['require'],
    system: ['module']
};
function getDeterministicObjectDestructure(objectPattern) {
    const variables = [];
    for (const property of objectPattern.properties) {
        if (property.type === 'RestElement' || property.computed || property.key.type !== 'Identifier')
            return;
        variables.push(property.key.name);
    }
    return variables;
}
