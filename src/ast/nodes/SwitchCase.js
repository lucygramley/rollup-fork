import { findFirstOccurrenceOutsideComment, renderStatementList } from '../../utils/renderHelpers';
import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class SwitchCase extends NodeBase {
    hasEffects(context) {
        if (this.test?.hasEffects(context))
            return true;
        for (const node of this.consequent) {
            if (context.brokenFlow)
                break;
            if (node.hasEffects(context))
                return true;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.test?.include(context, includeChildrenRecursively);
        for (const node of this.consequent) {
            if (includeChildrenRecursively || node.shouldBeIncluded(context))
                node.include(context, includeChildrenRecursively);
        }
    }
    render(code, options, nodeRenderOptions) {
        if (this.test) {
            this.test.render(code, options);
            if (this.test.start === this.start + 4) {
                code.prependLeft(this.test.start, ' ');
            }
        }
        if (this.consequent.length > 0) {
            const testEnd = this.test
                ? this.test.end
                : findFirstOccurrenceOutsideComment(code.original, 'default', this.start) + 7;
            const consequentStart = findFirstOccurrenceOutsideComment(code.original, ':', testEnd) + 1;
            renderStatementList(this.consequent, code, consequentStart, nodeRenderOptions.end, options);
        }
    }
}
SwitchCase.prototype.needsBoundaries = true;
SwitchCase.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
SwitchCase.prototype.applyDeoptimizations = doNotDeoptimize;
