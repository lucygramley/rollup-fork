import ClassDeclaration from './ClassDeclaration';
import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ExportNamedDeclaration extends NodeBase {
    bind() {
        // Do not bind specifiers
        this.declaration?.bind();
    }
    hasEffects(context) {
        return !!this.declaration?.hasEffects(context);
    }
    initialise() {
        super.initialise();
        this.scope.context.addExport(this);
    }
    removeAnnotations(code) {
        this.declaration?.removeAnnotations(code);
    }
    render(code, options, nodeRenderOptions) {
        const { start, end } = nodeRenderOptions;
        if (this.declaration === null) {
            code.remove(start, end);
        }
        else {
            let endBoundary = this.declaration.start;
            // the start of the decorator may be before the start of the class declaration
            if (this.declaration instanceof ClassDeclaration) {
                const decorators = this.declaration.decorators;
                for (const decorator of decorators) {
                    endBoundary = Math.min(endBoundary, decorator.start);
                }
                if (endBoundary <= this.start) {
                    endBoundary = this.declaration.start;
                }
            }
            code.remove(this.start, endBoundary);
            this.declaration.render(code, options, { end, start });
        }
    }
}
ExportNamedDeclaration.prototype.needsBoundaries = true;
ExportNamedDeclaration.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ExportNamedDeclaration.prototype.applyDeoptimizations = doNotDeoptimize;
