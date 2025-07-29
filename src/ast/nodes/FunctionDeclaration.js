import Identifier from './Identifier';
import FunctionNode from './shared/FunctionNode';
export default class FunctionDeclaration extends FunctionNode {
    initialise() {
        super.initialise();
        if (this.id !== null) {
            this.id.variable.isId = true;
        }
    }
    onlyFunctionCallUsed() {
        // call super.onlyFunctionCallUsed for export default anonymous function
        return this.id?.variable.getOnlyFunctionCallUsed() ?? super.onlyFunctionCallUsed();
    }
    parseNode(esTreeNode) {
        if (esTreeNode.id !== null) {
            this.id = new Identifier(this, this.scope.parent).parseNode(esTreeNode.id);
        }
        return super.parseNode(esTreeNode);
    }
}
