import { UNKNOWN_PATH } from '../utils/PathTracker';
import { NodeBase } from './shared/Node';
export default class JSXExpressionContainer extends NodeBase {
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.expression.includePath(UNKNOWN_PATH, context);
    }
    render(code, options) {
        const { mode } = this.scope.context.options.jsx;
        if (mode !== 'preserve') {
            code.remove(this.start, this.expression.start);
            code.remove(this.expression.end, this.end);
        }
        this.expression.render(code, options);
    }
}
