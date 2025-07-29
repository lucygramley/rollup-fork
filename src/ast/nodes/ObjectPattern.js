import { getCommaSeparatedNodesWithBoundaries } from '../../utils/renderHelpers';
import { treeshakeNode } from '../../utils/treeshakeNode';
import { EMPTY_PATH } from '../utils/PathTracker';
import * as NodeType from './NodeType';
import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ObjectPattern extends NodeBase {
    addExportedVariables(variables, exportNamesByVariable) {
        for (const property of this.properties) {
            if (property.type === NodeType.Property) {
                property.value.addExportedVariables(variables, exportNamesByVariable);
            }
            else {
                property.argument.addExportedVariables(variables, exportNamesByVariable);
            }
        }
    }
    declare(kind, destructuredInitPath, init) {
        const variables = [];
        for (const property of this.properties) {
            variables.push(...property.declare(kind, destructuredInitPath, init));
        }
        return variables;
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        for (const property of this.properties) {
            property.deoptimizeAssignment(destructuredInitPath, init);
        }
    }
    deoptimizePath(path) {
        if (path.length === 0) {
            for (const property of this.properties) {
                property.deoptimizePath(path);
            }
        }
    }
    hasEffectsOnInteractionAtPath(
    // At the moment, this is only triggered for assignment left-hand sides,
    // where the path is empty
    _path, interaction, context) {
        for (const property of this.properties) {
            if (property.hasEffectsOnInteractionAtPath(EMPTY_PATH, interaction, context))
                return true;
        }
        return false;
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        for (const property of this.properties) {
            if (property.hasEffectsWhenDestructuring(context, destructuredInitPath, init))
                return true;
        }
        return false;
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        if (!this.properties.length)
            return false;
        const lastProperty = this.properties.at(-1);
        const lastPropertyIncluded = lastProperty.includeDestructuredIfNecessary(context, destructuredInitPath, init);
        const lastPropertyIsRestElement = lastProperty.type === NodeType.RestElement;
        let included = lastPropertyIsRestElement ? lastPropertyIncluded : false;
        for (const property of this.properties.slice(0, -1)) {
            if (lastPropertyIsRestElement && lastPropertyIncluded) {
                property.includeNode(context);
            }
            included =
                property.includeDestructuredIfNecessary(context, destructuredInitPath, init) || included;
        }
        return (this.included ||= included);
    }
    markDeclarationReached() {
        for (const property of this.properties) {
            property.markDeclarationReached();
        }
    }
    render(code, options) {
        if (this.properties.length > 0) {
            const separatedNodes = getCommaSeparatedNodesWithBoundaries(this.properties, code, this.start + 1, this.end - 1);
            let lastSeparatorPos = null;
            for (const { node, separator, start, end } of separatedNodes) {
                if (!node.included) {
                    treeshakeNode(node, code, start, end);
                    continue;
                }
                lastSeparatorPos = separator;
                node.render(code, options);
            }
            if (lastSeparatorPos) {
                code.remove(lastSeparatorPos, this.end - 1);
            }
        }
    }
}
ObjectPattern.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ObjectPattern.prototype.applyDeoptimizations = doNotDeoptimize;
