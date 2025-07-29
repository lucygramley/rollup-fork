import { findFirstOccurrenceOutsideComment, renderStatementList } from '../../utils/renderHelpers';
import BlockScope from '../scopes/BlockScope';
import * as NodeType from './NodeType';
import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class StaticBlock extends StatementBase {
    createScope(parentScope) {
        this.scope = new BlockScope(parentScope);
    }
    hasEffects(context) {
        for (const node of this.body) {
            if (node.hasEffects(context))
                return true;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        for (const node of this.body) {
            if (includeChildrenRecursively || node.shouldBeIncluded(context))
                node.include(context, includeChildrenRecursively);
        }
    }
    render(code, options) {
        if (this.body.length > 0) {
            const bodyStartPos = findFirstOccurrenceOutsideComment(code.original.slice(this.start, this.end), '{') + 1;
            renderStatementList(this.body, code, this.start + bodyStartPos, this.end - 1, options);
        }
        else {
            super.render(code, options);
        }
    }
}
StaticBlock.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
StaticBlock.prototype.applyDeoptimizations = doNotDeoptimize;
export function isStaticBlock(statement) {
    return statement.type === NodeType.StaticBlock;
}
