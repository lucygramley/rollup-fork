import { UNKNOWN_PATH } from '../utils/PathTracker';
import { UNKNOWN_EXPRESSION } from './shared/Expression';
import { doNotDeoptimize, StatementBase } from './shared/Node';
export default class ReturnStatement extends StatementBase {
    hasEffects(context) {
        if (!context.ignore.returnYield || this.argument?.hasEffects(context))
            return true;
        context.brokenFlow = true;
        return false;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        this.argument?.include(context, includeChildrenRecursively);
        context.brokenFlow = true;
    }
    includeNode(context) {
        this.included = true;
        this.argument?.includePath(UNKNOWN_PATH, context);
    }
    initialise() {
        super.initialise();
        this.scope.addReturnExpression(this.argument || UNKNOWN_EXPRESSION);
    }
    render(code, options) {
        if (this.argument) {
            this.argument.render(code, options, { preventASI: true });
            if (this.argument.start === this.start + 6 /* 'return'.length */) {
                code.prependLeft(this.start + 6, ' ');
            }
        }
    }
}
ReturnStatement.prototype.applyDeoptimizations = doNotDeoptimize;
