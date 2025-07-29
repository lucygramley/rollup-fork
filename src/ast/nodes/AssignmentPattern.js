import { BLANK } from '../../utils/blank';
import { EMPTY_PATH, UNKNOWN_PATH } from '../utils/PathTracker';
import { NodeBase } from './shared/Node';
export default class AssignmentPattern extends NodeBase {
    addExportedVariables(variables, exportNamesByVariable) {
        this.left.addExportedVariables(variables, exportNamesByVariable);
    }
    declare(kind, destructuredInitPath, init) {
        return this.left.declare(kind, destructuredInitPath, init);
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        this.left.deoptimizeAssignment(destructuredInitPath, init);
    }
    deoptimizePath(path) {
        if (path.length === 0) {
            this.left.deoptimizePath(path);
        }
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        return (path.length > 0 || this.left.hasEffectsOnInteractionAtPath(EMPTY_PATH, interaction, context));
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        return this.left.hasEffectsWhenDestructuring(context, destructuredInitPath, init);
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        let included = this.left.includeDestructuredIfNecessary(context, destructuredInitPath, init) ||
            this.included;
        if ((included ||= this.right.shouldBeIncluded(context))) {
            this.right.include(context, false);
            if (!this.left.included) {
                this.left.included = true;
                // Unfortunately, we need to include the left side again now, so that
                // any declared variables are properly included.
                this.left.includeDestructuredIfNecessary(context, destructuredInitPath, init);
            }
        }
        return (this.included = included);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.right.includePath(UNKNOWN_PATH, context);
    }
    markDeclarationReached() {
        this.left.markDeclarationReached();
    }
    render(code, options, { isShorthandProperty } = BLANK) {
        this.left.render(code, options, { isShorthandProperty });
        this.right.render(code, options);
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.left.deoptimizePath(EMPTY_PATH);
        this.right.deoptimizePath(UNKNOWN_PATH);
        this.scope.context.requestTreeshakingPass();
    }
}
