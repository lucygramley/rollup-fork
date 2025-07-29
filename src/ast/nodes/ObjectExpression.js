import { BLANK } from '../../utils/blank';
import { getCommaSeparatedNodesWithBoundaries } from '../../utils/renderHelpers';
import { treeshakeNode } from '../../utils/treeshakeNode';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER, UNKNOWN_PATH, UnknownKey } from '../utils/PathTracker';
import Identifier from './Identifier';
import Literal from './Literal';
import * as NodeType from './NodeType';
import { doNotDeoptimize, NodeBase } from './shared/Node';
import { ObjectEntity } from './shared/ObjectEntity';
import { OBJECT_PROTOTYPE } from './shared/ObjectPrototype';
import SpreadElement from './SpreadElement';
export default class ObjectExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.objectEntity = null;
        this.protoProp = null;
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        this.getObjectEntity().deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
    }
    deoptimizeCache() {
        this.getObjectEntity().deoptimizeAllProperties();
    }
    deoptimizePath(path) {
        this.getObjectEntity().deoptimizePath(path);
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        return this.getObjectEntity().getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin) {
        return this.getObjectEntity().getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin);
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        return this.getObjectEntity().hasEffectsOnInteractionAtPath(path, interaction, context);
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        this.getObjectEntity().include(context, includeChildrenRecursively);
        this.protoProp?.include(context, includeChildrenRecursively);
    }
    includeNode(context) {
        this.included = true;
        this.protoProp?.includePath(UNKNOWN_PATH, context);
    }
    includePath(path, context) {
        if (!this.included)
            this.includeNode(context);
        this.getObjectEntity().includePath(path, context);
    }
    render(code, options, { renderedSurroundingElement } = BLANK) {
        if (renderedSurroundingElement === NodeType.ExpressionStatement ||
            renderedSurroundingElement === NodeType.ArrowFunctionExpression) {
            code.appendRight(this.start, '(');
            code.prependLeft(this.end, ')');
        }
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
    getObjectEntity() {
        if (this.objectEntity !== null) {
            return this.objectEntity;
        }
        let prototype = OBJECT_PROTOTYPE;
        const properties = [];
        for (const property of this.properties) {
            if (property instanceof SpreadElement) {
                properties.push({ key: UnknownKey, kind: 'init', property });
                continue;
            }
            let key;
            if (property.computed) {
                const keyValue = property.key.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this);
                if (typeof keyValue === 'symbol') {
                    properties.push({ key: UnknownKey, kind: property.kind, property });
                    continue;
                }
                else {
                    key = String(keyValue);
                }
            }
            else {
                key =
                    property.key instanceof Identifier
                        ? property.key.name
                        : String(property.key.value);
                if (key === '__proto__' && property.kind === 'init') {
                    this.protoProp = property;
                    prototype =
                        property.value instanceof Literal && property.value.value === null
                            ? null
                            : property.value;
                    continue;
                }
            }
            properties.push({ key, kind: property.kind, property });
        }
        return (this.objectEntity = new ObjectEntity(properties, prototype));
    }
}
ObjectExpression.prototype.applyDeoptimizations = doNotDeoptimize;
