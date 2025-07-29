import { EMPTY_PATH } from '../utils/PathTracker';
import { NodeBase } from './shared/Node';
export default class Super extends NodeBase {
    bind() {
        this.variable = this.scope.findVariable('this');
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        this.variable.deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
    }
    deoptimizePath(path) {
        this.variable.deoptimizePath(path);
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
}
