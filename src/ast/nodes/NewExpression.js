import { renderCallArguments } from '../../utils/renderCallArguments';
import { INTERACTION_ACCESSED, INTERACTION_CALLED } from '../NodeInteractions';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER, UNKNOWN_PATH } from '../utils/PathTracker';
import { NodeBase } from './shared/Node';
export default class NewExpression extends NodeBase {
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
    hasEffectsOnInteractionAtPath(path, { type }) {
        return path.length > 0 || type !== INTERACTION_ACCESSED;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        if (includeChildrenRecursively) {
            super.include(context, true);
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
        this.interaction = {
            args: [null, ...this.arguments],
            type: INTERACTION_CALLED,
            withNew: true
        };
        if (this.annotations &&
            this.scope.context.options.treeshake.annotations) {
            this.annotationPure = this.annotations.some(comment => comment.type === 'pure');
        }
    }
    render(code, options) {
        this.callee.render(code, options);
        renderCallArguments(code, options, this);
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.callee.deoptimizeArgumentsOnInteractionAtPath(this.interaction, EMPTY_PATH, SHARED_RECURSION_TRACKER);
        this.scope.context.requestTreeshakingPass();
    }
}
