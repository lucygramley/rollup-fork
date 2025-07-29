import { BLANK, EMPTY_ARRAY } from '../../utils/blank';
import { LOGLEVEL_WARN } from '../../utils/logging';
import { logIllegalImportReassignment, logMissingExport } from '../../utils/logs';
import { createHasEffectsContext, createInclusionContext } from '../ExecutionContext';
import { INTERACTION_ACCESSED, INTERACTION_ASSIGNED, NODE_INTERACTION_UNKNOWN_ACCESS } from '../NodeInteractions';
import { isAwaitExpressionNode, isImportExpressionNode } from '../utils/identifyNode';
import { MAX_PATH_DEPTH } from '../utils/limitPathLength';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER, SymbolToStringTag, UNKNOWN_PATH, UnknownKey, UnknownNonAccessorKey } from '../utils/PathTracker';
import { UNDEFINED_EXPRESSION } from '../values';
import ExternalVariable from '../variables/ExternalVariable';
import LocalVariable from '../variables/LocalVariable';
import Identifier from './Identifier';
import Literal from './Literal';
import { isFlagSet, setFlag } from './shared/BitFlags';
import { getChainElementLiteralValueAtPath } from './shared/chainElements';
import { deoptimizeInteraction, includeInteraction, includeInteractionWithoutThis, UNKNOWN_RETURN_EXPRESSION, UnknownValue } from './shared/Expression';
import { IS_SKIPPED_CHAIN, NodeBase } from './shared/Node';
function getResolvablePropertyKey(memberExpression) {
    return memberExpression.computed
        ? getResolvableComputedPropertyKey(memberExpression.property)
        : memberExpression.property.name;
}
function getResolvableComputedPropertyKey(propertyKey) {
    if (propertyKey instanceof Literal) {
        return String(propertyKey.value);
    }
    return null;
}
function getPathIfNotComputed(memberExpression) {
    const nextPathKey = memberExpression.propertyKey;
    const object = memberExpression.object;
    if (typeof nextPathKey === 'string') {
        if (object instanceof Identifier) {
            return [
                { key: object.name, pos: object.start },
                { key: nextPathKey, pos: memberExpression.property.start }
            ];
        }
        if (object instanceof MemberExpression) {
            const parentPath = getPathIfNotComputed(object);
            return (parentPath && [...parentPath, { key: nextPathKey, pos: memberExpression.property.start }]);
        }
    }
    return null;
}
function getStringFromPath(path) {
    let pathString = path[0].key;
    for (let index = 1; index < path.length; index++) {
        pathString += '.' + path[index].key;
    }
    return pathString;
}
export default class MemberExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.variable = null;
        this.expressionsToBeDeoptimized = [];
    }
    get computed() {
        return isFlagSet(this.flags, 1024 /* Flag.computed */);
    }
    set computed(value) {
        this.flags = setFlag(this.flags, 1024 /* Flag.computed */, value);
    }
    get optional() {
        return isFlagSet(this.flags, 128 /* Flag.optional */);
    }
    set optional(value) {
        this.flags = setFlag(this.flags, 128 /* Flag.optional */, value);
    }
    get assignmentDeoptimized() {
        return isFlagSet(this.flags, 16 /* Flag.assignmentDeoptimized */);
    }
    set assignmentDeoptimized(value) {
        this.flags = setFlag(this.flags, 16 /* Flag.assignmentDeoptimized */, value);
    }
    get bound() {
        return isFlagSet(this.flags, 32 /* Flag.bound */);
    }
    set bound(value) {
        this.flags = setFlag(this.flags, 32 /* Flag.bound */, value);
    }
    get isUndefined() {
        return isFlagSet(this.flags, 64 /* Flag.isUndefined */);
    }
    set isUndefined(value) {
        this.flags = setFlag(this.flags, 64 /* Flag.isUndefined */, value);
    }
    bind() {
        this.bound = true;
        const path = getPathIfNotComputed(this);
        const baseVariable = path && this.scope.findVariable(path[0].key);
        if (baseVariable?.isNamespace) {
            const resolvedVariable = resolveNamespaceVariables(baseVariable, path.slice(1), this.scope.context);
            if (!resolvedVariable) {
                super.bind();
            }
            else if (resolvedVariable === 'undefined') {
                this.isUndefined = true;
            }
            else {
                this.variable = resolvedVariable;
                this.scope.addNamespaceMemberAccess(getStringFromPath(path), resolvedVariable);
            }
        }
        else {
            super.bind();
        }
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        if (this.variable) {
            this.variable.deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
        }
        else if (!this.isUndefined) {
            if (path.length < MAX_PATH_DEPTH) {
                this.object.deoptimizeArgumentsOnInteractionAtPath(interaction, this.propertyKey === UnknownKey ? UNKNOWN_PATH : [this.propertyKey, ...path], recursionTracker);
            }
            else {
                deoptimizeInteraction(interaction);
            }
        }
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        this.deoptimizePath(EMPTY_PATH);
        init.deoptimizePath([...destructuredInitPath, UnknownKey]);
    }
    deoptimizeCache() {
        if (this.propertyKey === this.dynamicPropertyKey)
            return;
        const { expressionsToBeDeoptimized, object } = this;
        this.expressionsToBeDeoptimized = EMPTY_ARRAY;
        this.dynamicPropertyKey = this.propertyKey;
        object.deoptimizePath(UNKNOWN_PATH);
        if (this.included) {
            object.includePath(UNKNOWN_PATH, createInclusionContext());
        }
        for (const expression of expressionsToBeDeoptimized) {
            expression.deoptimizeCache();
        }
    }
    deoptimizePath(path) {
        if (path.length === 0)
            this.disallowNamespaceReassignment();
        if (this.variable) {
            this.variable.deoptimizePath(path);
        }
        else if (!this.isUndefined) {
            const { propertyKey } = this;
            this.object.deoptimizePath([
                propertyKey === UnknownKey ? UnknownNonAccessorKey : propertyKey,
                ...(path.length < MAX_PATH_DEPTH
                    ? path
                    : [...path.slice(0, MAX_PATH_DEPTH), UnknownKey])
            ]);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (this.variable) {
            return this.variable.getLiteralValueAtPath(path, recursionTracker, origin);
        }
        if (this.isUndefined) {
            return undefined;
        }
        const propertyKey = this.getDynamicPropertyKey();
        if (propertyKey !== UnknownKey && path.length < MAX_PATH_DEPTH) {
            if (propertyKey !== this.propertyKey)
                this.expressionsToBeDeoptimized.push(origin);
            return this.object.getLiteralValueAtPath([propertyKey, ...path], recursionTracker, origin);
        }
        return UnknownValue;
    }
    getLiteralValueAtPathAsChainElement(path, recursionTracker, origin) {
        if (this.variable) {
            return this.variable.getLiteralValueAtPath(path, recursionTracker, origin);
        }
        if (this.isUndefined) {
            return undefined;
        }
        return getChainElementLiteralValueAtPath(this, this.object, path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin) {
        if (this.variable) {
            return this.variable.getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin);
        }
        if (this.isUndefined) {
            return [UNDEFINED_EXPRESSION, false];
        }
        const propertyKey = this.getDynamicPropertyKey();
        if (propertyKey !== UnknownKey && path.length < MAX_PATH_DEPTH) {
            if (propertyKey !== this.propertyKey)
                this.expressionsToBeDeoptimized.push(origin);
            return this.object.getReturnExpressionWhenCalledAtPath([propertyKey, ...path], interaction, recursionTracker, origin);
        }
        return UNKNOWN_RETURN_EXPRESSION;
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        return (this.property.hasEffects(context) ||
            this.object.hasEffects(context) ||
            this.hasAccessEffect(context));
    }
    hasEffectsAsChainElement(context) {
        if (this.variable || this.isUndefined)
            return this.hasEffects(context);
        const objectHasEffects = 'hasEffectsAsChainElement' in this.object
            ? this.object.hasEffectsAsChainElement(context)
            : this.object.hasEffects(context);
        if (objectHasEffects === IS_SKIPPED_CHAIN)
            return IS_SKIPPED_CHAIN;
        if (this.optional &&
            this.object.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this) == null) {
            return objectHasEffects || IS_SKIPPED_CHAIN;
        }
        // We only apply deoptimizations lazily once we know we are not skipping
        if (!this.deoptimized)
            this.applyDeoptimizations();
        return objectHasEffects || this.property.hasEffects(context) || this.hasAccessEffect(context);
    }
    hasEffectsAsAssignmentTarget(context, checkAccess) {
        if (checkAccess && !this.deoptimized)
            this.applyDeoptimizations();
        if (!this.assignmentDeoptimized)
            this.applyAssignmentDeoptimization();
        return (this.property.hasEffects(context) ||
            this.object.hasEffects(context) ||
            (checkAccess && this.hasAccessEffect(context)) ||
            this.hasEffectsOnInteractionAtPath(EMPTY_PATH, this.assignmentInteraction, context));
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        if (this.variable) {
            return this.variable.hasEffectsOnInteractionAtPath(path, interaction, context);
        }
        if (this.isUndefined) {
            return true;
        }
        if (path.length < MAX_PATH_DEPTH) {
            return this.object.hasEffectsOnInteractionAtPath([this.getDynamicPropertyKey(), ...path], interaction, context);
        }
        return true;
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        return (destructuredInitPath.length > 0 &&
            init.hasEffectsOnInteractionAtPath(destructuredInitPath, NODE_INTERACTION_UNKNOWN_ACCESS, context));
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        this.object.include(context, includeChildrenRecursively);
        this.property.include(context, includeChildrenRecursively);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        if (this.variable) {
            this.scope.context.includeVariableInModule(this.variable, EMPTY_PATH, context);
        }
        else if (!this.isUndefined) {
            this.object.includePath([this.propertyKey], context);
        }
    }
    includeNodeAsAssignmentTarget(context) {
        this.included = true;
        if (!this.assignmentDeoptimized)
            this.applyAssignmentDeoptimization();
        if (this.variable) {
            this.scope.context.includeVariableInModule(this.variable, EMPTY_PATH, context);
        }
        else if (!this.isUndefined) {
            this.object.includePath([this.propertyKey], context);
        }
    }
    includePath(path, context) {
        if (!this.included)
            this.includeNode(context);
        if (this.variable) {
            this.variable?.includePath(path, context);
        }
        else if (!this.isUndefined) {
            this.object.includePath([
                this.propertyKey,
                ...(path.length < MAX_PATH_DEPTH
                    ? path
                    : [...path.slice(0, MAX_PATH_DEPTH), UnknownKey])
            ], context);
        }
    }
    includeAsAssignmentTarget(context, includeChildrenRecursively, deoptimizeAccess) {
        if (!this.included)
            this.includeNodeAsAssignmentTarget(context);
        if (deoptimizeAccess && !this.deoptimized)
            this.applyDeoptimizations();
        this.object.include(context, includeChildrenRecursively);
        this.property.include(context, includeChildrenRecursively);
    }
    includeCallArguments(interaction, context) {
        if (this.variable) {
            this.variable.includeCallArguments(interaction, context);
        }
        else {
            if (isImportExpressionNode(this.object) ||
                /**
                 * const c = await import('foo')
                 * c.foo();
                 */
                (this.object.variable &&
                    !this.object.variable.isReassigned &&
                    this.object.variable instanceof LocalVariable &&
                    isAwaitExpressionNode(this.object.variable.init) &&
                    isImportExpressionNode(this.object.variable.init.argument))) {
                includeInteractionWithoutThis(interaction, context);
            }
            else {
                includeInteraction(interaction, context);
            }
        }
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        if ((this.included ||=
            destructuredInitPath.length > 0 &&
                !context.brokenFlow &&
                init.hasEffectsOnInteractionAtPath(destructuredInitPath, NODE_INTERACTION_UNKNOWN_ACCESS, createHasEffectsContext()))) {
            init.include(context, false);
            return true;
        }
        return false;
    }
    initialise() {
        super.initialise();
        this.dynamicPropertyKey = getResolvablePropertyKey(this);
        this.propertyKey = this.dynamicPropertyKey === null ? UnknownKey : this.dynamicPropertyKey;
        this.accessInteraction = { args: [this.object], type: INTERACTION_ACCESSED };
    }
    render(code, options, { renderedParentType, isCalleeOfRenderedParent, renderedSurroundingElement } = BLANK) {
        if (this.variable || this.isUndefined) {
            const { snippets: { getPropertyAccess } } = options;
            let replacement = this.variable ? this.variable.getName(getPropertyAccess) : 'undefined';
            if (renderedParentType && isCalleeOfRenderedParent)
                replacement = '0, ' + replacement;
            code.overwrite(this.start, this.end, replacement, {
                contentOnly: true,
                storeName: true
            });
        }
        else {
            if (renderedParentType && isCalleeOfRenderedParent) {
                code.appendRight(this.start, '0, ');
            }
            this.object.render(code, options, { renderedSurroundingElement });
            this.property.render(code, options);
        }
    }
    setAssignedValue(value) {
        this.assignmentInteraction = {
            args: [this.object, value],
            type: INTERACTION_ASSIGNED
        };
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        const { propertyReadSideEffects } = this.scope.context.options
            .treeshake;
        if (
        // Namespaces are not bound and should not be deoptimized
        this.bound &&
            propertyReadSideEffects &&
            !(this.variable || this.isUndefined)) {
            this.object.deoptimizeArgumentsOnInteractionAtPath(this.accessInteraction, [this.propertyKey], SHARED_RECURSION_TRACKER);
            this.scope.context.requestTreeshakingPass();
        }
        if (this.variable) {
            this.variable.addUsedPlace(this);
            this.scope.context.requestTreeshakingPass();
        }
    }
    applyAssignmentDeoptimization() {
        this.assignmentDeoptimized = true;
        const { propertyReadSideEffects } = this.scope.context.options
            .treeshake;
        if (
        // Namespaces are not bound and should not be deoptimized
        this.bound &&
            propertyReadSideEffects &&
            !(this.variable || this.isUndefined)) {
            this.object.deoptimizeArgumentsOnInteractionAtPath(this.assignmentInteraction, [this.propertyKey], SHARED_RECURSION_TRACKER);
            this.scope.context.requestTreeshakingPass();
        }
    }
    disallowNamespaceReassignment() {
        if (this.object instanceof Identifier) {
            const variable = this.scope.findVariable(this.object.name);
            if (variable.isNamespace) {
                if (this.variable) {
                    this.scope.context.includeVariableInModule(this.variable, UNKNOWN_PATH, createInclusionContext());
                }
                this.scope.context.log(LOGLEVEL_WARN, logIllegalImportReassignment(this.object.name, this.scope.context.module.id), this.start);
            }
        }
    }
    getDynamicPropertyKey() {
        if (this.dynamicPropertyKey === null) {
            this.dynamicPropertyKey = this.propertyKey;
            const value = this.property.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
            return (this.dynamicPropertyKey =
                value === SymbolToStringTag
                    ? value
                    : typeof value === 'symbol'
                        ? UnknownKey
                        : String(value));
        }
        return this.dynamicPropertyKey;
    }
    hasAccessEffect(context) {
        const { propertyReadSideEffects } = this.scope.context.options
            .treeshake;
        return (!(this.variable || this.isUndefined) &&
            propertyReadSideEffects &&
            (propertyReadSideEffects === 'always' ||
                this.object.hasEffectsOnInteractionAtPath([this.getDynamicPropertyKey()], this.accessInteraction, context)));
    }
}
function resolveNamespaceVariables(baseVariable, path, astContext) {
    if (path.length === 0)
        return baseVariable;
    if (!baseVariable.isNamespace || baseVariable instanceof ExternalVariable)
        return null;
    const exportName = path[0].key;
    const [variable, options] = baseVariable.context.traceExport(exportName);
    if (!variable) {
        if (path.length === 1) {
            const fileName = baseVariable.context.fileName;
            astContext.log(LOGLEVEL_WARN, logMissingExport(exportName, astContext.module.id, fileName, !!options?.missingButExportExists), path[0].pos);
            return 'undefined';
        }
        return null;
    }
    return resolveNamespaceVariables(variable, path.slice(1), astContext);
}
