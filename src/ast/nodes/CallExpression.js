import { BLANK } from '../../utils/blank';
import { LOGLEVEL_WARN } from '../../utils/logging';
import { logCannotCallNamespace, logEval } from '../../utils/logs';
import { renderCallArguments } from '../../utils/renderCallArguments';
import { INTERACTION_CALLED } from '../NodeInteractions';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER, UNKNOWN_PATH } from '../utils/PathTracker';
import Identifier from './Identifier';
import MemberExpression from './MemberExpression';
import { isFlagSet, setFlag } from './shared/BitFlags';
import CallExpressionBase from './shared/CallExpressionBase';
import { getChainElementLiteralValueAtPath } from './shared/chainElements';
import { UNKNOWN_RETURN_EXPRESSION } from './shared/Expression';
import { INCLUDE_PARAMETERS, IS_SKIPPED_CHAIN } from './shared/Node';
export default class CallExpression extends CallExpressionBase {
    get hasCheckedForWarnings() {
        return isFlagSet(this.flags, 268435456 /* Flag.checkedForWarnings */);
    }
    set hasCheckedForWarnings(value) {
        this.flags = setFlag(this.flags, 268435456 /* Flag.checkedForWarnings */, value);
    }
    get optional() {
        return isFlagSet(this.flags, 128 /* Flag.optional */);
    }
    set optional(value) {
        this.flags = setFlag(this.flags, 128 /* Flag.optional */, value);
    }
    bind() {
        super.bind();
        this.interaction = {
            args: [
                this.callee instanceof MemberExpression && !this.callee.variable
                    ? this.callee.object
                    : null,
                ...this.arguments
            ],
            type: INTERACTION_CALLED,
            withNew: false
        };
    }
    getLiteralValueAtPathAsChainElement(path, recursionTracker, origin) {
        return getChainElementLiteralValueAtPath(this, this.callee, path, recursionTracker, origin);
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        for (const argument of this.arguments) {
            if (argument.hasEffects(context))
                return true;
        }
        if (this.annotationPure) {
            return false;
        }
        return (this.callee.hasEffects(context) ||
            this.callee.hasEffectsOnInteractionAtPath(EMPTY_PATH, this.interaction, context));
    }
    hasEffectsAsChainElement(context) {
        const calleeHasEffects = 'hasEffectsAsChainElement' in this.callee
            ? this.callee.hasEffectsAsChainElement(context)
            : this.callee.hasEffects(context);
        if (calleeHasEffects === IS_SKIPPED_CHAIN)
            return IS_SKIPPED_CHAIN;
        if (this.optional &&
            this.callee.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this) == null) {
            return (!this.annotationPure && calleeHasEffects) || IS_SKIPPED_CHAIN;
        }
        // We only apply deoptimizations lazily once we know we are not skipping
        if (!this.deoptimized)
            this.applyDeoptimizations();
        for (const argument of this.arguments) {
            if (argument.hasEffects(context))
                return true;
        }
        return (!this.annotationPure &&
            (calleeHasEffects ||
                this.callee.hasEffectsOnInteractionAtPath(EMPTY_PATH, this.interaction, context)));
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        if (includeChildrenRecursively) {
            super.include(context, true);
            if (includeChildrenRecursively === INCLUDE_PARAMETERS &&
                this.callee instanceof Identifier &&
                this.callee.variable) {
                this.callee.variable.markCalledFromTryStatement();
            }
        }
        else {
            this.callee.include(context, false);
            this.callee.includeCallArguments(this.interaction, context);
        }
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.callee.includePath(UNKNOWN_PATH, context);
    }
    initialise() {
        super.initialise();
        if (this.annotations &&
            this.scope.context.options.treeshake.annotations) {
            this.annotationPure = this.annotations.some(comment => comment.type === 'pure');
        }
    }
    render(code, options, { renderedSurroundingElement } = BLANK) {
        this.callee.render(code, options, {
            isCalleeOfRenderedParent: true,
            renderedSurroundingElement
        });
        renderCallArguments(code, options, this);
        if (this.callee instanceof Identifier && !this.hasCheckedForWarnings) {
            this.hasCheckedForWarnings = true;
            const variable = this.scope.findVariable(this.callee.name);
            if (variable.isNamespace) {
                this.scope.context.log(LOGLEVEL_WARN, logCannotCallNamespace(this.callee.name), this.start);
            }
            if (this.callee.name === 'eval') {
                this.scope.context.log(LOGLEVEL_WARN, logEval(this.scope.context.module.id), this.start);
            }
        }
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.callee.deoptimizeArgumentsOnInteractionAtPath(this.interaction, EMPTY_PATH, SHARED_RECURSION_TRACKER);
        this.scope.context.requestTreeshakingPass();
    }
    getReturnExpression(recursionTracker = SHARED_RECURSION_TRACKER) {
        if (this.returnExpression === null) {
            this.returnExpression = UNKNOWN_RETURN_EXPRESSION;
            return (this.returnExpression = this.callee.getReturnExpressionWhenCalledAtPath(EMPTY_PATH, this.interaction, recursionTracker, this));
        }
        return this.returnExpression;
    }
}
