import { locate } from 'locate-character';
import { ANNOTATION_KEY, INVALID_ANNOTATION_KEY } from '../../../utils/astConverterHelpers';
import { childNodeKeys } from '../../childNodeKeys';
import { createHasEffectsContext } from '../../ExecutionContext';
import { INTERACTION_ASSIGNED } from '../../NodeInteractions';
import { EMPTY_PATH, UNKNOWN_PATH } from '../../utils/PathTracker';
import { isFlagSet, setFlag } from './BitFlags';
import { ExpressionEntity } from './Expression';
export const INCLUDE_PARAMETERS = 'variables';
export const IS_SKIPPED_CHAIN = Symbol('IS_SKIPPED_CHAIN');
export class NodeBase extends ExpressionEntity {
    /**
     * Nodes can apply custom deoptimizations once they become part of the
     * executed code. To do this, they must initialize this as false, implement
     * applyDeoptimizations and call this from include and hasEffects if they have
     * custom handlers
     */
    get deoptimized() {
        return isFlagSet(this.flags, 2 /* Flag.deoptimized */);
    }
    set deoptimized(value) {
        this.flags = setFlag(this.flags, 2 /* Flag.deoptimized */, value);
    }
    constructor(parent, parentScope) {
        super();
        this.parent = parent;
        this.scope = parentScope;
        this.createScope(parentScope);
    }
    addExportedVariables(_variables, _exportNamesByVariable) { }
    /**
     * Override this to bind assignments to variables and do any initialisations
     * that require the scopes to be populated with variables.
     */
    bind() {
        for (const key of childNodeKeys[this.type]) {
            const value = this[key];
            if (Array.isArray(value)) {
                for (const child of value) {
                    child?.bind();
                }
            }
            else if (value) {
                value.bind();
            }
        }
    }
    /**
     * Override if this node should receive a different scope than the parent
     * scope.
     */
    createScope(parentScope) {
        this.scope = parentScope;
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        for (const key of childNodeKeys[this.type]) {
            const value = this[key];
            if (value === null)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child?.hasEffects(context))
                        return true;
                }
            }
            else if (value.hasEffects(context))
                return true;
        }
        return false;
    }
    hasEffectsAsAssignmentTarget(context, _checkAccess) {
        return (this.hasEffects(context) ||
            this.hasEffectsOnInteractionAtPath(EMPTY_PATH, this.assignmentInteraction, context));
    }
    include(context, includeChildrenRecursively, _options) {
        if (!this.included)
            this.includeNode(context);
        for (const key of childNodeKeys[this.type]) {
            const value = this[key];
            if (value === null)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    child?.include(context, includeChildrenRecursively);
                }
            }
            else {
                value.include(context, includeChildrenRecursively);
            }
        }
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        for (const key of childNodeKeys[this.type]) {
            const value = this[key];
            if (value === null)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    child?.includePath(UNKNOWN_PATH, context);
                }
            }
            else {
                value.includePath(UNKNOWN_PATH, context);
            }
        }
    }
    includeAsAssignmentTarget(context, includeChildrenRecursively, _deoptimizeAccess) {
        this.include(context, includeChildrenRecursively);
    }
    /**
     * Override to perform special initialisation steps after the scope is
     * initialised
     */
    initialise() {
        this.scope.context.magicString.addSourcemapLocation(this.start);
        this.scope.context.magicString.addSourcemapLocation(this.end);
    }
    parseNode(esTreeNode) {
        for (const [key, value] of Object.entries(esTreeNode)) {
            // Skip properties defined on the class already.
            // This way, we can override this function to add custom initialisation and then call super.parseNode
            // Note: this doesn't skip properties with defined getters/setters which we use to pack wrap booleans
            // in bitfields. Those are still assigned from the value in the esTreeNode.
            if (this.hasOwnProperty(key))
                continue;
            if (key.charCodeAt(0) === 95 /* _ */) {
                if (key === ANNOTATION_KEY) {
                    this.annotations = value;
                }
                else if (key === INVALID_ANNOTATION_KEY) {
                    this.invalidAnnotations = value;
                }
            }
            else if (typeof value !== 'object' || value === null) {
                this[key] = value;
            }
            else if (Array.isArray(value)) {
                this[key] = new Array(value.length);
                let index = 0;
                for (const child of value) {
                    this[key][index++] =
                        child === null
                            ? null
                            : new (this.scope.context.getNodeConstructor(child.type))(this, this.scope).parseNode(child);
                }
            }
            else {
                this[key] = new (this.scope.context.getNodeConstructor(value.type))(this, this.scope).parseNode(value);
            }
        }
        // extend child keys for unknown node types
        childNodeKeys[esTreeNode.type] ||= createChildNodeKeysForNode(esTreeNode);
        this.initialise();
        return this;
    }
    removeAnnotations(code) {
        if (this.annotations) {
            for (const annotation of this.annotations) {
                code.remove(annotation.start, annotation.end);
            }
        }
    }
    render(code, options) {
        for (const key of childNodeKeys[this.type]) {
            const value = this[key];
            if (value === null)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    child?.render(code, options);
                }
            }
            else {
                value.render(code, options);
            }
        }
    }
    setAssignedValue(value) {
        this.assignmentInteraction = { args: [null, value], type: INTERACTION_ASSIGNED };
    }
    shouldBeIncluded(context) {
        return this.included || (!context.brokenFlow && this.hasEffects(createHasEffectsContext()));
    }
    /**
     * Just deoptimize everything by default so that when e.g. we do not track
     * something properly, it is deoptimized.
     * @protected
     */
    applyDeoptimizations() {
        this.deoptimized = true;
        for (const key of childNodeKeys[this.type]) {
            const value = this[key];
            if (value === null)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    child?.deoptimizePath(UNKNOWN_PATH);
                }
            }
            else {
                value.deoptimizePath(UNKNOWN_PATH);
            }
        }
        this.scope.context.requestTreeshakingPass();
    }
}
export { NodeBase as StatementBase };
function createChildNodeKeysForNode(esTreeNode) {
    return Object.keys(esTreeNode).filter(key => typeof esTreeNode[key] === 'object' && key.charCodeAt(0) !== 95 /* _ */);
}
export function locateNode(node) {
    const { start, scope: { context: { code, fileName } } } = node;
    const location = locate(code, start, { offsetLine: 1 });
    location.file = fileName;
    location.toString = () => JSON.stringify(location);
    return location;
}
export function logNode(node) {
    if ('scope' in node) {
        return node.scope.context.code.slice(node.start, node.end);
    }
    return node.constructor.name;
}
export function onlyIncludeSelf() {
    this.included = true;
    if (!this.deoptimized)
        this.applyDeoptimizations();
}
export function onlyIncludeSelfNoDeoptimize() {
    this.included = true;
}
export function doNotDeoptimize() {
    this.deoptimized = true;
}
