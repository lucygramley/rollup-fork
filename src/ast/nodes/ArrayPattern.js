import { EMPTY_PATH, UnknownInteger, UnknownKey } from '../utils/PathTracker';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class ArrayPattern extends NodeBase {
    addExportedVariables(variables, exportNamesByVariable) {
        for (const element of this.elements) {
            element?.addExportedVariables(variables, exportNamesByVariable);
        }
    }
    declare(kind, destructuredInitPath, init) {
        const variables = [];
        const includedPatternPath = getIncludedPatternPath(destructuredInitPath);
        for (const element of this.elements) {
            if (element !== null) {
                variables.push(...element.declare(kind, includedPatternPath, init));
            }
        }
        return variables;
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        const includedPatternPath = getIncludedPatternPath(destructuredInitPath);
        for (const element of this.elements) {
            element?.deoptimizeAssignment(includedPatternPath, init);
        }
    }
    // Patterns can only be deoptimized at the empty path at the moment
    deoptimizePath() {
        for (const element of this.elements) {
            element?.deoptimizePath(EMPTY_PATH);
        }
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        const includedPatternPath = getIncludedPatternPath(destructuredInitPath);
        for (const element of this.elements) {
            if (element?.hasEffectsWhenDestructuring(context, includedPatternPath, init)) {
                return true;
            }
        }
        return false;
    }
    // Patterns are only checked at the empty path at the moment
    hasEffectsOnInteractionAtPath(_path, interaction, context) {
        for (const element of this.elements) {
            if (element?.hasEffectsOnInteractionAtPath(EMPTY_PATH, interaction, context))
                return true;
        }
        return false;
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        let included = false;
        const includedPatternPath = getIncludedPatternPath(destructuredInitPath);
        for (const element of this.elements) {
            if (element) {
                element.included ||= included;
                included =
                    element.includeDestructuredIfNecessary(context, includedPatternPath, init) || included;
            }
        }
        if (included) {
            // This is necessary so that if any pattern element is included, all are
            // included for proper deconflicting
            for (const element of this.elements) {
                if (element && !element.included) {
                    element.included = true;
                    element.includeDestructuredIfNecessary(context, includedPatternPath, init);
                }
            }
        }
        return (this.included ||= included);
    }
    markDeclarationReached() {
        for (const element of this.elements) {
            element?.markDeclarationReached();
        }
    }
}
ArrayPattern.prototype.includeNode = onlyIncludeSelf;
const getIncludedPatternPath = (destructuredInitPath) => destructuredInitPath.at(-1) === UnknownKey
    ? destructuredInitPath
    : [...destructuredInitPath, UnknownInteger];
