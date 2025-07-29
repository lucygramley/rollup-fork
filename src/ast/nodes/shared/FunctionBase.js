import { INTERACTION_CALLED, NODE_INTERACTION_UNKNOWN_ACCESS, NODE_INTERACTION_UNKNOWN_CALL } from '../../NodeInteractions';
import { EMPTY_PATH, UNKNOWN_PATH, UnknownKey } from '../../utils/PathTracker';
import { UNDEFINED_EXPRESSION } from '../../values';
import BlockStatement from '../BlockStatement';
import * as NodeType from '../NodeType';
import RestElement from '../RestElement';
import { isFlagSet, setFlag } from './BitFlags';
import { UNKNOWN_EXPRESSION, UNKNOWN_RETURN_EXPRESSION } from './Expression';
import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './Node';
export default class FunctionBase extends NodeBase {
    constructor() {
        super(...arguments);
        this.parameterVariableValuesDeoptimized = false;
        this.includeCallArguments = this.scope.includeCallArguments.bind(this.scope);
    }
    get async() {
        return isFlagSet(this.flags, 256 /* Flag.async */);
    }
    set async(value) {
        this.flags = setFlag(this.flags, 256 /* Flag.async */, value);
    }
    get deoptimizedReturn() {
        return isFlagSet(this.flags, 512 /* Flag.deoptimizedReturn */);
    }
    set deoptimizedReturn(value) {
        this.flags = setFlag(this.flags, 512 /* Flag.deoptimizedReturn */, value);
    }
    get generator() {
        return isFlagSet(this.flags, 4194304 /* Flag.generator */);
    }
    set generator(value) {
        this.flags = setFlag(this.flags, 4194304 /* Flag.generator */, value);
    }
    get hasCachedEffects() {
        return isFlagSet(this.flags, 67108864 /* Flag.hasEffects */);
    }
    set hasCachedEffects(value) {
        this.flags = setFlag(this.flags, 67108864 /* Flag.hasEffects */, value);
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        if (interaction.type === INTERACTION_CALLED && path.length === 0) {
            this.scope.deoptimizeArgumentsOnCall(interaction);
        }
        else {
            this.getObjectEntity().deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
        }
    }
    deoptimizePath(path) {
        this.getObjectEntity().deoptimizePath(path);
        if (path.length === 1 && path[0] === UnknownKey) {
            // A reassignment of UNKNOWN_PATH is considered equivalent to having lost track
            // which means the return expression and parameters need to be reassigned
            this.scope.getReturnExpression().deoptimizePath(UNKNOWN_PATH);
            this.scope.deoptimizeAllParameters();
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        return this.getObjectEntity().getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin) {
        if (path.length > 0) {
            return this.getObjectEntity().getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin);
        }
        if (this.async) {
            if (!this.deoptimizedReturn) {
                this.deoptimizedReturn = true;
                this.scope.getReturnExpression().deoptimizePath(UNKNOWN_PATH);
                this.scope.context.requestTreeshakingPass();
            }
            return UNKNOWN_RETURN_EXPRESSION;
        }
        return [this.scope.getReturnExpression(), false];
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        if (path.length > 0 || interaction.type !== INTERACTION_CALLED) {
            return this.getObjectEntity().hasEffectsOnInteractionAtPath(path, interaction, context);
        }
        if (this.hasCachedEffects) {
            return true;
        }
        if (this.async) {
            const { propertyReadSideEffects } = this.scope.context.options
                .treeshake;
            const returnExpression = this.scope.getReturnExpression();
            if (returnExpression.hasEffectsOnInteractionAtPath(['then'], NODE_INTERACTION_UNKNOWN_CALL, context) ||
                (propertyReadSideEffects &&
                    (propertyReadSideEffects === 'always' ||
                        returnExpression.hasEffectsOnInteractionAtPath(['then'], NODE_INTERACTION_UNKNOWN_ACCESS, context)))) {
                this.hasCachedEffects = true;
                return true;
            }
        }
        const { propertyReadSideEffects } = this.scope.context.options
            .treeshake;
        for (let index = 0; index < this.params.length; index++) {
            const parameter = this.params[index];
            if (parameter.hasEffects(context) ||
                (propertyReadSideEffects &&
                    parameter.hasEffectsWhenDestructuring(context, EMPTY_PATH, interaction.args[index + 1] || UNDEFINED_EXPRESSION))) {
                this.hasCachedEffects = true;
                return true;
            }
        }
        return false;
    }
    /**
     * If the function (expression or declaration) is only used as function calls
     */
    onlyFunctionCallUsed() {
        let variable = null;
        if (this.parent.type === NodeType.VariableDeclarator) {
            variable = this.parent.id.variable ?? null;
        }
        if (this.parent.type === NodeType.ExportDefaultDeclaration) {
            variable = this.parent.variable;
        }
        return variable?.getOnlyFunctionCallUsed() ?? false;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        if (!(this.parameterVariableValuesDeoptimized || this.onlyFunctionCallUsed())) {
            this.parameterVariableValuesDeoptimized = true;
            this.scope.reassignAllParameters();
        }
        const { brokenFlow } = context;
        context.brokenFlow = false;
        this.body.include(context, includeChildrenRecursively);
        context.brokenFlow = brokenFlow;
    }
    initialise() {
        super.initialise();
        if (this.body instanceof BlockStatement) {
            this.body.addImplicitReturnExpressionToScope();
        }
        else {
            this.scope.addReturnExpression(this.body);
        }
        if (this.annotations &&
            this.scope.context.options.treeshake.annotations) {
            this.annotationNoSideEffects = this.annotations.some(comment => comment.type === 'noSideEffects');
        }
    }
    parseNode(esTreeNode) {
        const { body, params } = esTreeNode;
        const { scope } = this;
        const { bodyScope, context } = scope;
        // We need to ensure that parameters are declared before the body is parsed
        // so that the scope already knows all parameters and can detect conflicts
        // when parsing the body.
        const parameters = (this.params = params.map((parameter) => new (context.getNodeConstructor(parameter.type))(this, scope).parseNode(parameter)));
        scope.addParameterVariables(parameters.map(parameter => parameter.declare('parameter', EMPTY_PATH, UNKNOWN_EXPRESSION)), parameters[parameters.length - 1] instanceof RestElement);
        this.body = new (context.getNodeConstructor(body.type))(this, bodyScope).parseNode(body);
        return super.parseNode(esTreeNode);
    }
}
FunctionBase.prototype.preventChildBlockScope = true;
FunctionBase.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
FunctionBase.prototype.applyDeoptimizations = doNotDeoptimize;
