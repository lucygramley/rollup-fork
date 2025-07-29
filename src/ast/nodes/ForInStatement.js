import { NO_SEMICOLON } from '../../utils/renderHelpers';
import BlockScope from '../scopes/BlockScope';
import { EMPTY_PATH, UNKNOWN_PATH } from '../utils/PathTracker';
import { UNKNOWN_EXPRESSION } from './shared/Expression';
import { hasLoopBodyEffects, includeLoopBody } from './shared/loops';
import { StatementBase } from './shared/Node';
export default class ForInStatement extends StatementBase {
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        const { body, deoptimized, left, right } = this;
        if (!deoptimized)
            this.applyDeoptimizations();
        if (left.hasEffectsAsAssignmentTarget(context, false) || right.hasEffects(context))
            return true;
        return hasLoopBodyEffects(context, body);
    }
    include(context, includeChildrenRecursively) {
        const { body, deoptimized, left, right } = this;
        if (!deoptimized)
            this.applyDeoptimizations();
        if (!this.included)
            this.includeNode(context);
        left.includeAsAssignmentTarget(context, includeChildrenRecursively || true, false);
        right.include(context, includeChildrenRecursively);
        includeLoopBody(context, body, includeChildrenRecursively);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.right.includePath(UNKNOWN_PATH, context);
    }
    initialise() {
        super.initialise();
        this.left.setAssignedValue(UNKNOWN_EXPRESSION);
    }
    render(code, options) {
        this.left.render(code, options, NO_SEMICOLON);
        this.right.render(code, options, NO_SEMICOLON);
        // handle no space between "in" and the right side
        if (code.original.charCodeAt(this.right.start - 1) === 110 /* n */) {
            code.prependLeft(this.right.start, ' ');
        }
        this.body.render(code, options);
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.left.deoptimizePath(EMPTY_PATH);
        this.scope.context.requestTreeshakingPass();
    }
}
