import { BLANK } from '../../utils/blank';
import { isReassignedExportsMember } from '../../utils/reassignedExportsMember';
import { findFirstOccurrenceOutsideComment, findNonWhiteSpace } from '../../utils/renderHelpers';
import { EMPTY_PATH } from '../utils/PathTracker';
import { UNDEFINED_EXPRESSION } from '../values';
import ClassExpression from './ClassExpression';
import Identifier from './Identifier';
import * as NodeType from './NodeType';
import { doNotDeoptimize, NodeBase } from './shared/Node';
export default class VariableDeclarator extends NodeBase {
    declareDeclarator(kind, isUsingDeclaration) {
        this.isUsingDeclaration = isUsingDeclaration;
        this.id.declare(kind, EMPTY_PATH, this.init || UNDEFINED_EXPRESSION);
    }
    deoptimizePath(path) {
        this.id.deoptimizePath(path);
    }
    hasEffects(context) {
        const initEffect = this.init?.hasEffects(context);
        this.id.markDeclarationReached();
        return (initEffect ||
            this.isUsingDeclaration ||
            this.id.hasEffects(context) ||
            (this.scope.context.options.treeshake
                .propertyReadSideEffects &&
                this.id.hasEffectsWhenDestructuring(context, EMPTY_PATH, this.init || UNDEFINED_EXPRESSION)));
    }
    include(context, includeChildrenRecursively) {
        const { id, init } = this;
        if (!this.included)
            this.includeNode();
        init?.include(context, includeChildrenRecursively);
        id.markDeclarationReached();
        if (includeChildrenRecursively) {
            id.include(context, includeChildrenRecursively);
        }
        else {
            id.includeDestructuredIfNecessary(context, EMPTY_PATH, init || UNDEFINED_EXPRESSION);
        }
    }
    removeAnnotations(code) {
        this.init?.removeAnnotations(code);
    }
    render(code, options) {
        const { exportNamesByVariable, snippets: { _, getPropertyAccess } } = options;
        const { end, id, init, start } = this;
        const renderId = id.included || this.isUsingDeclaration;
        if (renderId) {
            id.render(code, options);
        }
        else {
            const operatorPos = findFirstOccurrenceOutsideComment(code.original, '=', id.end);
            code.remove(start, findNonWhiteSpace(code.original, operatorPos + 1));
        }
        if (init) {
            if (id instanceof Identifier && init instanceof ClassExpression && !init.id) {
                const renderedVariable = id.variable.getName(getPropertyAccess);
                if (renderedVariable !== id.name) {
                    code.appendLeft(init.start + 5, ` ${id.name}`);
                }
            }
            init.render(code, options, renderId ? BLANK : { renderedSurroundingElement: NodeType.ExpressionStatement });
        }
        else if (id instanceof Identifier &&
            isReassignedExportsMember(id.variable, exportNamesByVariable)) {
            code.appendLeft(end, `${_}=${_}void 0`);
        }
    }
    includeNode() {
        this.included = true;
        const { id, init } = this;
        if (init && id instanceof Identifier && init instanceof ClassExpression && !init.id) {
            const { name, variable } = id;
            for (const accessedVariable of init.scope.accessedOutsideVariables.values()) {
                if (accessedVariable !== variable) {
                    accessedVariable.forbidName(name);
                }
            }
        }
    }
}
VariableDeclarator.prototype.applyDeoptimizations = doNotDeoptimize;
