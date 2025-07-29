import ClassBodyScope from '../scopes/ClassBodyScope';
import { UNKNOWN_PATH } from '../utils/PathTracker';
import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ClassBody extends NodeBase {
    createScope(parentScope) {
        this.scope = new ClassBodyScope(parentScope, this.parent);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.scope.context.includeVariableInModule(this.scope.thisVariable, UNKNOWN_PATH, context);
        for (const definition of this.body) {
            definition.include(context, includeChildrenRecursively);
        }
    }
    parseNode(esTreeNode) {
        const body = (this.body = new Array(esTreeNode.body.length));
        let index = 0;
        for (const definition of esTreeNode.body) {
            body[index++] = new (this.scope.context.getNodeConstructor(definition.type))(this, definition.static ? this.scope : this.scope.instanceScope).parseNode(definition);
        }
        return super.parseNode(esTreeNode);
    }
}
ClassBody.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ClassBody.prototype.applyDeoptimizations = doNotDeoptimize;
