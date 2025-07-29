import { NO_SEMICOLON } from '../../utils/renderHelpers';
import BlockScope from '../scopes/BlockScope';
import { hasLoopBodyEffects, includeLoopBody } from './shared/loops';
import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class ForStatement extends StatementBase {
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        if (this.init?.hasEffects(context) ||
            this.test?.hasEffects(context) ||
            this.update?.hasEffects(context)) {
            return true;
        }
        return hasLoopBodyEffects(context, this.body);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.init?.include(context, includeChildrenRecursively, {
            asSingleStatement: true
        });
        this.test?.include(context, includeChildrenRecursively);
        this.update?.include(context, includeChildrenRecursively);
        includeLoopBody(context, this.body, includeChildrenRecursively);
    }
    render(code, options) {
        this.init?.render(code, options, NO_SEMICOLON);
        this.test?.render(code, options, NO_SEMICOLON);
        this.update?.render(code, options, NO_SEMICOLON);
        this.body.render(code, options);
    }
}
ForStatement.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ForStatement.prototype.applyDeoptimizations = doNotDeoptimize;
