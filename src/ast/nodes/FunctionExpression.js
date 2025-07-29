import { BLANK } from '../../utils/blank';
import ChildScope from '../scopes/ChildScope';
import Identifier from './Identifier';
import * as NodeType from './NodeType';
import FunctionNode from './shared/FunctionNode';
export default class FunctionExpression extends FunctionNode {
    createScope(parentScope) {
        super.createScope((this.idScope = new ChildScope(parentScope, parentScope.context)));
    }
    parseNode(esTreeNode) {
        if (esTreeNode.id !== null) {
            this.id = new Identifier(this, this.idScope).parseNode(esTreeNode.id);
        }
        return super.parseNode(esTreeNode);
    }
    onlyFunctionCallUsed() {
        const isIIFE = this.parent.type === NodeType.CallExpression &&
            this.parent.callee === this &&
            (this.id === null || this.id.variable.getOnlyFunctionCallUsed());
        return isIIFE || super.onlyFunctionCallUsed();
    }
    render(code, options, { renderedSurroundingElement } = BLANK) {
        super.render(code, options);
        if (renderedSurroundingElement === NodeType.ExpressionStatement) {
            code.appendRight(this.start, '(');
            code.prependLeft(this.end, ')');
        }
    }
}
