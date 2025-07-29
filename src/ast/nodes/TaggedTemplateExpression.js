import { LOGLEVEL_WARN } from '../../utils/logging';
import { logCannotCallNamespace } from '../../utils/logs';
import { INTERACTION_CALLED } from '../NodeInteractions';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER } from '../utils/PathTracker';
import MemberExpression from './MemberExpression';
import * as NodeType from './NodeType';
import { isFlagSet, setFlag } from './shared/BitFlags';
import CallExpressionBase from './shared/CallExpressionBase';
import { UNKNOWN_EXPRESSION, UNKNOWN_RETURN_EXPRESSION } from './shared/Expression';
import { onlyIncludeSelf } from './shared/Node';
export default class TaggedTemplateExpression extends CallExpressionBase {
    get hasCheckedForWarnings() {
        return isFlagSet(this.flags, 268435456 /* Flag.checkedForWarnings */);
    }
    set hasCheckedForWarnings(value) {
        this.flags = setFlag(this.flags, 268435456 /* Flag.checkedForWarnings */, value);
    }
    bind() {
        super.bind();
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        for (const argument of this.quasi.expressions) {
            if (argument.hasEffects(context))
                return true;
        }
        return (this.tag.hasEffects(context) ||
            this.tag.hasEffectsOnInteractionAtPath(EMPTY_PATH, this.interaction, context));
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        if (includeChildrenRecursively) {
            super.include(context, true);
        }
        else {
            this.quasi.include(context, false);
            this.tag.include(context, false);
            this.tag.includeCallArguments(this.interaction, context);
        }
    }
    initialise() {
        super.initialise();
        this.args = [UNKNOWN_EXPRESSION, ...this.quasi.expressions];
        this.interaction = {
            args: [
                this.tag instanceof MemberExpression && !this.tag.variable ? this.tag.object : null,
                ...this.args
            ],
            type: INTERACTION_CALLED,
            withNew: false
        };
    }
    render(code, options) {
        this.tag.render(code, options, { isCalleeOfRenderedParent: true });
        this.quasi.render(code, options);
        if (!this.hasCheckedForWarnings && this.tag.type === NodeType.Identifier) {
            this.hasCheckedForWarnings = true;
            const name = this.tag.name;
            const variable = this.scope.findVariable(name);
            if (variable.isNamespace) {
                this.scope.context.log(LOGLEVEL_WARN, logCannotCallNamespace(name), this.start);
            }
        }
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.tag.deoptimizeArgumentsOnInteractionAtPath(this.interaction, EMPTY_PATH, SHARED_RECURSION_TRACKER);
        this.scope.context.requestTreeshakingPass();
    }
    getReturnExpression(recursionTracker = SHARED_RECURSION_TRACKER) {
        if (this.returnExpression === null) {
            this.returnExpression = UNKNOWN_RETURN_EXPRESSION;
            return (this.returnExpression = this.tag.getReturnExpressionWhenCalledAtPath(EMPTY_PATH, this.interaction, recursionTracker, this));
        }
        return this.returnExpression;
    }
}
TaggedTemplateExpression.prototype.includeNode = onlyIncludeSelf;
