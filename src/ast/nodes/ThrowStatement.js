import { UNKNOWN_PATH } from '../utils/PathTracker';
import { StatementBase } from './shared/Node';
export default class ThrowStatement extends StatementBase {
    hasEffects() {
        return true;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        this.argument.include(context, includeChildrenRecursively);
        context.brokenFlow = true;
    }
    includeNode(context) {
        if (!this.included) {
            this.included = true;
            this.argument.includePath(UNKNOWN_PATH, context);
        }
    }
    render(code, options) {
        this.argument.render(code, options, { preventASI: true });
        if (this.argument.start === this.start + 5 /* 'throw'.length */) {
            code.prependLeft(this.start + 5, ' ');
        }
    }
}
