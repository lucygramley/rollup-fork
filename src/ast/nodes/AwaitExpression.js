import ArrowFunctionExpression from './ArrowFunctionExpression';
import FunctionNode from './shared/FunctionNode';
import { NodeBase } from './shared/Node';
export default class AwaitExpression extends NodeBase {
    hasEffects() {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        return true;
    }
    initialise() {
        super.initialise();
        let parent = this.parent;
        do {
            if (parent instanceof FunctionNode || parent instanceof ArrowFunctionExpression)
                return;
        } while ((parent = parent.parent));
        this.scope.context.usesTopLevelAwait = true;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        this.argument.include(context, includeChildrenRecursively);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        // Thenables need to be included
        this.argument.includePath(THEN_PATH, context);
    }
    includePath(path, context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        if (!this.included)
            this.includeNode(context);
        this.argument.includePath(path, context);
    }
}
const THEN_PATH = ['then'];
