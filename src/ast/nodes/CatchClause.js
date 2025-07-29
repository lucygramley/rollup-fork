import ParameterScope from '../scopes/ParameterScope';
import { EMPTY_PATH } from '../utils/PathTracker';
import BlockStatement from './BlockStatement';
import { UNKNOWN_EXPRESSION } from './shared/Expression';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class CatchClause extends NodeBase {
    createScope(parentScope) {
        this.scope = new ParameterScope(parentScope, true);
    }
    parseNode(esTreeNode) {
        const { body, param, type } = esTreeNode;
        this.type = type;
        if (param) {
            this.param = new (this.scope.context.getNodeConstructor(param.type))(this, this.scope).parseNode(param);
            this.param.declare('parameter', EMPTY_PATH, UNKNOWN_EXPRESSION);
        }
        this.body = new BlockStatement(this, this.scope.bodyScope).parseNode(body);
        return super.parseNode(esTreeNode);
    }
}
CatchClause.prototype.preventChildBlockScope = true;
CatchClause.prototype.includeNode = onlyIncludeSelf;
