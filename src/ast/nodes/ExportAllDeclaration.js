import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ExportAllDeclaration extends NodeBase {
    hasEffects() {
        return false;
    }
    initialise() {
        super.initialise();
        this.scope.context.addExport(this);
    }
    render(code, _options, nodeRenderOptions) {
        code.remove(nodeRenderOptions.start, nodeRenderOptions.end);
    }
}
ExportAllDeclaration.prototype.needsBoundaries = true;
ExportAllDeclaration.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ExportAllDeclaration.prototype.applyDeoptimizations = doNotDeoptimize;
