import { UNKNOWN_PATH } from '../utils/PathTracker';
import { NodeBase } from './shared/Node';
export default class YieldExpression extends NodeBase {
    applyDeoptimizations() {
        this.deoptimized = true;
        this.argument?.deoptimizePath(UNKNOWN_PATH);
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        return !(context.ignore.returnYield && !this.argument?.hasEffects(context));
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.argument?.includePath(UNKNOWN_PATH, context);
    }
    render(code, options) {
        if (this.argument) {
            this.argument.render(code, options, { preventASI: true });
            if (this.argument.start === this.start + 5 /* 'yield'.length */) {
                code.prependLeft(this.start + 5, ' ');
            }
        }
    }
}
