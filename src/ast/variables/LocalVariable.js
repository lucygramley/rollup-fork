import { EMPTY_ARRAY } from '../../utils/blank';
import { INTERACTION_ACCESSED, INTERACTION_ASSIGNED, INTERACTION_CALLED } from '../NodeInteractions';
import * as NodeType from '../nodes/NodeType';
import { deoptimizeInteraction, includeInteraction, UNKNOWN_EXPRESSION, UNKNOWN_RETURN_EXPRESSION, UnknownValue } from '../nodes/shared/Expression';
import { isArrowFunctionExpressionNode, isCallExpressionNode, isFunctionExpressionNode, isIdentifierNode, isImportExpressionNode, isMemberExpressionNode } from '../utils/identifyNode';
import { limitConcatenatedPathDepth, MAX_PATH_DEPTH } from '../utils/limitPathLength';
import { IncludedFullPathTracker, UNKNOWN_PATH, UnknownKey } from '../utils/PathTracker';
import Variable from './Variable';
export default class LocalVariable extends Variable {
    constructor(name, declarator, init, 
    /** if this is non-empty, the actual init is this path of this.init */
    initPath, context, kind) {
        super(name);
        this.init = init;
        this.initPath = initPath;
        this.kind = kind;
        this.calledFromTryStatement = false;
        this.additionalInitializers = null;
        this.includedPathTracker = new IncludedFullPathTracker();
        this.expressionsToBeDeoptimized = [];
        this.declarations = declarator ? [declarator] : [];
        this.deoptimizationTracker = context.deoptimizationTracker;
        this.module = context.module;
    }
    addDeclaration(identifier, init) {
        this.declarations.push(identifier);
        this.markInitializersForDeoptimization().push(init);
    }
    consolidateInitializers() {
        if (this.additionalInitializers) {
            for (const initializer of this.additionalInitializers) {
                initializer.deoptimizePath(UNKNOWN_PATH);
            }
        }
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        if (this.isReassigned || path.length + this.initPath.length > MAX_PATH_DEPTH) {
            deoptimizeInteraction(interaction);
            return;
        }
        recursionTracker.withTrackedEntityAtPath(path, this.init, () => {
            this.init.deoptimizeArgumentsOnInteractionAtPath(interaction, [...this.initPath, ...path], recursionTracker);
        }, undefined);
    }
    deoptimizePath(path) {
        if (this.isReassigned ||
            this.deoptimizationTracker.trackEntityAtPathAndGetIfTracked(path, this)) {
            return;
        }
        if (path.length === 0) {
            this.markReassigned();
            const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
            this.expressionsToBeDeoptimized = EMPTY_ARRAY;
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
            this.init.deoptimizePath([...this.initPath, UnknownKey]);
        }
        else {
            this.init.deoptimizePath(limitConcatenatedPathDepth(this.initPath, path));
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (this.isReassigned || path.length + this.initPath.length > MAX_PATH_DEPTH) {
            return UnknownValue;
        }
        return recursionTracker.withTrackedEntityAtPath(path, this.init, () => {
            this.expressionsToBeDeoptimized.push(origin);
            return this.init.getLiteralValueAtPath([...this.initPath, ...path], recursionTracker, origin);
        }, UnknownValue);
    }
    getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin) {
        if (this.isReassigned || path.length + this.initPath.length > MAX_PATH_DEPTH) {
            return UNKNOWN_RETURN_EXPRESSION;
        }
        return recursionTracker.withTrackedEntityAtPath(path, this.init, () => {
            this.expressionsToBeDeoptimized.push(origin);
            return this.init.getReturnExpressionWhenCalledAtPath([...this.initPath, ...path], interaction, recursionTracker, origin);
        }, UNKNOWN_RETURN_EXPRESSION);
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        if (path.length + this.initPath.length > MAX_PATH_DEPTH) {
            return true;
        }
        switch (interaction.type) {
            case INTERACTION_ACCESSED: {
                if (this.isReassigned)
                    return true;
                return (!context.accessed.trackEntityAtPathAndGetIfTracked(path, this) &&
                    this.init.hasEffectsOnInteractionAtPath([...this.initPath, ...path], interaction, context));
            }
            case INTERACTION_ASSIGNED: {
                if (this.included)
                    return true;
                if (path.length === 0)
                    return false;
                if (this.isReassigned)
                    return true;
                return (!context.assigned.trackEntityAtPathAndGetIfTracked(path, this) &&
                    this.init.hasEffectsOnInteractionAtPath([...this.initPath, ...path], interaction, context));
            }
            case INTERACTION_CALLED: {
                if (this.isReassigned)
                    return true;
                return (!(interaction.withNew ? context.instantiated : context.called).trackEntityAtPathAndGetIfTracked(path, interaction.args, this) &&
                    this.init.hasEffectsOnInteractionAtPath([...this.initPath, ...path], interaction, context));
            }
        }
    }
    includePath(path, context) {
        if (!this.includedPathTracker.includePathAndGetIfIncluded(path)) {
            this.module.scope.context.requestTreeshakingPass();
            if (!this.included) {
                // This will reduce the number of tree-shaking passes by eagerly
                // including inits. By pushing this here instead of directly including
                // we avoid deep call stacks.
                this.module.scope.context.newlyIncludedVariableInits.add(this.init);
            }
            super.includePath(path, context);
            for (const declaration of this.declarations) {
                // If node is a default export, it can save a tree-shaking run to include the full declaration now
                if (!declaration.included)
                    declaration.include(context, false);
                let node = declaration.parent;
                while (!node.included) {
                    // We do not want to properly include parents in case they are part of a dead branch
                    // in which case .include() might pull in more dead code
                    node.includeNode(context);
                    if (node.type === NodeType.Program)
                        break;
                    node = node.parent;
                }
                /**
                 * import('foo').then(m => {
                 *   console.log(m.foo)
                 * })
                 */
                if (this.kind === 'parameter' &&
                    (isArrowFunctionExpressionNode(declaration.parent) ||
                        isFunctionExpressionNode(declaration.parent)) &&
                    isCallExpressionNode(declaration.parent.parent) &&
                    isMemberExpressionNode(declaration.parent.parent.callee) &&
                    isIdentifierNode(declaration.parent.parent.callee.property) &&
                    declaration.parent.parent.callee.property.name === 'then' &&
                    isImportExpressionNode(declaration.parent.parent.callee.object)) {
                    declaration.parent.parent.callee.object.includePath(path);
                }
            }
            // We need to make sure we include the correct path of the init
            if (path.length > 0) {
                this.init.includePath(limitConcatenatedPathDepth(this.initPath, path), context);
                this.additionalInitializers?.forEach(initializer => initializer.includePath(UNKNOWN_PATH, context));
            }
        }
    }
    includeCallArguments(interaction, context) {
        if (this.isReassigned ||
            context.includedCallArguments.has(this.init) ||
            // This can be removed again once we can include arguments when called at
            // a specific path
            this.initPath.length > 0) {
            includeInteraction(interaction, context);
        }
        else {
            context.includedCallArguments.add(this.init);
            this.init.includeCallArguments(interaction, context);
            context.includedCallArguments.delete(this.init);
        }
    }
    markCalledFromTryStatement() {
        this.calledFromTryStatement = true;
    }
    markInitializersForDeoptimization() {
        if (this.additionalInitializers === null) {
            this.additionalInitializers = [this.init];
            this.init = UNKNOWN_EXPRESSION;
            this.markReassigned();
        }
        return this.additionalInitializers;
    }
}
