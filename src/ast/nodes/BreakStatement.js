import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class BreakStatement extends StatementBase {
    hasEffects(context) {
        if (this.label) {
            if (!context.ignore.labels.has(this.label.name))
                return true;
            context.includedLabels.add(this.label.name);
        }
        else {
            if (!context.ignore.breaks)
                return true;
            context.hasBreak = true;
        }
        context.brokenFlow = true;
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        if (this.label) {
            this.label.include(context, includeChildrenRecursively);
            context.includedLabels.add(this.label.name);
        }
        else {
            context.hasBreak = true;
        }
        context.brokenFlow = true;
    }
}
BreakStatement.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
BreakStatement.prototype.applyDeoptimizations = doNotDeoptimize;
