import { LOGLEVEL_WARN } from '../../utils/logging';
import { logThisIsUndefined } from '../../utils/logs';
import { INTERACTION_ACCESSED } from '../NodeInteractions';
import ChildScope from '../scopes/ChildScope';
import FunctionScope from '../scopes/FunctionScope';
import ModuleScope from '../scopes/ModuleScope';
import { EMPTY_PATH } from '../utils/PathTracker';
import ObjectExpression from './ObjectExpression';
import Property from './Property';
import { NodeBase } from './shared/Node';
export default class ThisExpression extends NodeBase {
    bind() {
        this.variable = this.scope.findVariable('this');
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        this.variable.deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
    }
    deoptimizePath(path) {
        this.variable.deoptimizePath(path);
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        if (path.length === 0) {
            return interaction.type !== INTERACTION_ACCESSED;
        }
        return this.variable.hasEffectsOnInteractionAtPath(path, interaction, context);
    }
    include(context) {
        if (!this.included)
            this.includeNode(context);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.scope.context.includeVariableInModule(this.variable, EMPTY_PATH, context);
    }
    includePath(path, context) {
        if (!this.included) {
            this.included = true;
            this.scope.context.includeVariableInModule(this.variable, path, context);
        }
        else if (path.length > 0) {
            this.variable.includePath(path, context);
        }
        const functionScope = findFunctionScope(this.scope, this.variable);
        if (functionScope &&
            functionScope.functionNode.parent instanceof Property &&
            functionScope.functionNode.parent.parent instanceof ObjectExpression) {
            functionScope.functionNode.parent.parent.includePath(path, context);
        }
    }
    initialise() {
        super.initialise();
        this.alias =
            this.scope.findLexicalBoundary() instanceof ModuleScope
                ? this.scope.context.moduleContext
                : null;
        if (this.alias === 'undefined') {
            this.scope.context.log(LOGLEVEL_WARN, logThisIsUndefined(), this.start);
        }
    }
    render(code) {
        if (this.alias !== null) {
            code.overwrite(this.start, this.end, this.alias, {
                contentOnly: false,
                storeName: true
            });
        }
    }
}
function findFunctionScope(scope, thisVariable) {
    while (!(scope instanceof FunctionScope && scope.thisVariable === thisVariable)) {
        if (!(scope instanceof ChildScope)) {
            return null;
        }
        scope = scope.parent;
    }
    return scope;
}
