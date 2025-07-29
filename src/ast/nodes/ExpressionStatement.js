import { LOGLEVEL_WARN } from '../../utils/logging';
import { logModuleLevelDirective } from '../../utils/logs';
import * as NodeType from './NodeType';
import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class ExpressionStatement extends StatementBase {
    initialise() {
        super.initialise();
        if (this.directive &&
            this.directive !== 'use strict' &&
            this.parent.type === NodeType.Program) {
            this.scope.context.log(LOGLEVEL_WARN, 
            // This is necessary, because either way (deleting or not) can lead to errors.
            logModuleLevelDirective(this.directive, this.scope.context.module.id), this.start);
        }
    }
    removeAnnotations(code) {
        this.expression.removeAnnotations(code);
    }
    render(code, options) {
        super.render(code, options);
        if (code.original[this.end - 1] !== ';') {
            code.appendLeft(this.end, ';');
        }
    }
    shouldBeIncluded(context) {
        if (this.directive && this.directive !== 'use strict')
            return this.parent.type !== NodeType.Program;
        return super.shouldBeIncluded(context);
    }
}
ExpressionStatement.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ExpressionStatement.prototype.applyDeoptimizations = doNotDeoptimize;
