import { hasLoopBodyEffects, includeLoopBody } from './shared/loops';
import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class WhileStatement extends StatementBase {
    hasEffects(context) {
        if (this.test.hasEffects(context))
            return true;
        return hasLoopBodyEffects(context, this.body);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.test.include(context, includeChildrenRecursively);
        includeLoopBody(context, this.body, includeChildrenRecursively);
    }
}
WhileStatement.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
WhileStatement.prototype.applyDeoptimizations = doNotDeoptimize;
