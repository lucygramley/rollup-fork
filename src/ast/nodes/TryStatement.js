import { doNotDeoptimize, INCLUDE_PARAMETERS, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class TryStatement extends StatementBase {
    constructor() {
        super(...arguments);
        this.directlyIncluded = false;
        this.includedLabelsAfterBlock = null;
    }
    hasEffects(context) {
        return ((this.scope.context.options.treeshake.tryCatchDeoptimization
            ? this.block.body.length > 0
            : this.block.hasEffects(context)) || !!this.finalizer?.hasEffects(context));
    }
    include(context, includeChildrenRecursively) {
        const tryCatchDeoptimization = this.scope.context.options.treeshake?.tryCatchDeoptimization;
        const { brokenFlow, includedLabels } = context;
        if (!this.directlyIncluded || !tryCatchDeoptimization) {
            this.included = true;
            this.directlyIncluded = true;
            this.block.include(context, tryCatchDeoptimization ? INCLUDE_PARAMETERS : includeChildrenRecursively);
            if (includedLabels.size > 0) {
                this.includedLabelsAfterBlock = [...includedLabels];
            }
            context.brokenFlow = brokenFlow;
        }
        else if (this.includedLabelsAfterBlock) {
            for (const label of this.includedLabelsAfterBlock) {
                includedLabels.add(label);
            }
        }
        if (this.handler !== null) {
            this.handler.include(context, includeChildrenRecursively);
            context.brokenFlow = brokenFlow;
        }
        this.finalizer?.include(context, includeChildrenRecursively);
    }
}
TryStatement.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
TryStatement.prototype.applyDeoptimizations = doNotDeoptimize;
