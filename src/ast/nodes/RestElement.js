import { EMPTY_PATH, UnknownKey } from '../utils/PathTracker';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class RestElement extends NodeBase {
    constructor() {
        super(...arguments);
        this.declarationInit = null;
    }
    addExportedVariables(variables, exportNamesByVariable) {
        this.argument.addExportedVariables(variables, exportNamesByVariable);
    }
    declare(kind, destructuredInitPath, init) {
        this.declarationInit = init;
        return this.argument.declare(kind, getIncludedPatternPath(destructuredInitPath), init);
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        this.argument.deoptimizeAssignment(getIncludedPatternPath(destructuredInitPath), init);
    }
    deoptimizePath(path) {
        if (path.length === 0) {
            this.argument.deoptimizePath(EMPTY_PATH);
        }
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        return (path.length > 0 ||
            this.argument.hasEffectsOnInteractionAtPath(EMPTY_PATH, interaction, context));
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        return this.argument.hasEffectsWhenDestructuring(context, getIncludedPatternPath(destructuredInitPath), init);
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        return (this.included =
            this.argument.includeDestructuredIfNecessary(context, getIncludedPatternPath(destructuredInitPath), init) || this.included);
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        // This should just include the identifier, its properties should be
        // included where the variable is used.
        this.argument.include(context, includeChildrenRecursively);
    }
    markDeclarationReached() {
        this.argument.markDeclarationReached();
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        if (this.declarationInit !== null) {
            this.declarationInit.deoptimizePath([UnknownKey, UnknownKey]);
            this.scope.context.requestTreeshakingPass();
        }
    }
}
RestElement.prototype.includeNode = onlyIncludeSelf;
const getIncludedPatternPath = (destructuredInitPath) => destructuredInitPath.at(-1) === UnknownKey
    ? destructuredInitPath
    : [...destructuredInitPath, UnknownKey];
