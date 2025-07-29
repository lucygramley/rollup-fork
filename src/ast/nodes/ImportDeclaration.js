import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ImportDeclaration extends NodeBase {
    // Do not bind specifiers or attributes
    bind() { }
    hasEffects() {
        return false;
    }
    initialise() {
        super.initialise();
        this.scope.context.addImport(this);
    }
    render(code, _options, nodeRenderOptions) {
        code.remove(nodeRenderOptions.start, nodeRenderOptions.end);
    }
}
ImportDeclaration.prototype.needsBoundaries = true;
ImportDeclaration.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ImportDeclaration.prototype.applyDeoptimizations = doNotDeoptimize;
