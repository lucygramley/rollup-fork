import { renderStatementList } from '../../utils/renderHelpers';
import BlockScope from '../scopes/BlockScope';
import ExpressionStatement from './ExpressionStatement';
import * as NodeType from './NodeType';
import { isFlagSet, setFlag } from './shared/BitFlags';
import { UNKNOWN_EXPRESSION } from './shared/Expression';
import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize, StatementBase } from './shared/Node';
export default class BlockStatement extends StatementBase {
    get deoptimizeBody() {
        return isFlagSet(this.flags, 32768 /* Flag.deoptimizeBody */);
    }
    set deoptimizeBody(value) {
        this.flags = setFlag(this.flags, 32768 /* Flag.deoptimizeBody */, value);
    }
    get directlyIncluded() {
        return isFlagSet(this.flags, 16384 /* Flag.directlyIncluded */);
    }
    set directlyIncluded(value) {
        this.flags = setFlag(this.flags, 16384 /* Flag.directlyIncluded */, value);
    }
    addImplicitReturnExpressionToScope() {
        const lastStatement = this.body[this.body.length - 1];
        if (!lastStatement || lastStatement.type !== NodeType.ReturnStatement) {
            this.scope.addReturnExpression(UNKNOWN_EXPRESSION);
        }
    }
    createScope(parentScope) {
        this.scope = this.parent.preventChildBlockScope
            ? parentScope
            : new BlockScope(parentScope);
    }
    hasEffects(context) {
        if (this.deoptimizeBody)
            return true;
        for (const node of this.body) {
            if (context.brokenFlow)
                break;
            if (node.hasEffects(context))
                return true;
        }
        return false;
    }
    include(context, includeChildrenRecursively) {
        if (!(this.deoptimizeBody && this.directlyIncluded)) {
            this.included = true;
            this.directlyIncluded = true;
            if (this.deoptimizeBody)
                includeChildrenRecursively = true;
            for (const node of this.body) {
                if (includeChildrenRecursively || node.shouldBeIncluded(context))
                    node.include(context, includeChildrenRecursively);
            }
        }
    }
    initialise() {
        super.initialise();
        this.scope.context.magicString.addSourcemapLocation(this.end - 1);
        const firstBodyStatement = this.body[0];
        this.deoptimizeBody =
            firstBodyStatement instanceof ExpressionStatement &&
                firstBodyStatement.directive === 'use asm';
    }
    render(code, options) {
        if (this.body.length > 0) {
            renderStatementList(this.body, code, this.start + 1, this.end - 1, options);
        }
        else {
            super.render(code, options);
        }
    }
}
BlockStatement.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
BlockStatement.prototype.applyDeoptimizations = doNotDeoptimize;
