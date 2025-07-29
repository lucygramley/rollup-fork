import { findFirstOccurrenceOutsideComment, findNonWhiteSpace } from '../../utils/renderHelpers';
import { UNKNOWN_PATH } from '../utils/PathTracker';
import { doNotDeoptimize, StatementBase } from './shared/Node';
export default class LabeledStatement extends StatementBase {
    hasEffects(context) {
        const { brokenFlow, includedLabels } = context;
        context.ignore.labels.add(this.label.name);
        context.includedLabels = new Set();
        let bodyHasEffects = false;
        if (this.body.hasEffects(context)) {
            bodyHasEffects = true;
        }
        else {
            context.ignore.labels.delete(this.label.name);
            if (context.includedLabels.has(this.label.name)) {
                context.includedLabels.delete(this.label.name);
                context.brokenFlow = brokenFlow;
            }
        }
        context.includedLabels = new Set([...includedLabels, ...context.includedLabels]);
        return bodyHasEffects;
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        const { brokenFlow, includedLabels } = context;
        context.includedLabels = new Set();
        this.body.include(context, includeChildrenRecursively);
        if (includeChildrenRecursively || context.includedLabels.has(this.label.name)) {
            this.label.include(context, includeChildrenRecursively);
            context.includedLabels.delete(this.label.name);
            context.brokenFlow = brokenFlow;
        }
        context.includedLabels = new Set([...includedLabels, ...context.includedLabels]);
    }
    includeNode(context) {
        this.included = true;
        this.body.includePath(UNKNOWN_PATH, context);
    }
    render(code, options) {
        if (this.label.included) {
            this.label.render(code, options);
        }
        else {
            code.remove(this.start, findNonWhiteSpace(code.original, findFirstOccurrenceOutsideComment(code.original, ':', this.label.end) + 1));
        }
        this.body.render(code, options);
    }
}
LabeledStatement.prototype.applyDeoptimizations = doNotDeoptimize;
