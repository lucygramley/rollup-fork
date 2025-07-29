import { BLANK } from '../../utils/blank';
import { LOGLEVEL_WARN } from '../../utils/logging';
import { logConstVariableReassignError } from '../../utils/logs';
import { findFirstOccurrenceOutsideComment, findNonWhiteSpace, removeLineBreaks } from '../../utils/renderHelpers';
import { renderSystemExportExpression, renderSystemExportFunction, renderSystemExportSequenceAfterExpression } from '../../utils/systemJsRendering';
import { createHasEffectsContext } from '../ExecutionContext';
import { EMPTY_PATH, UNKNOWN_PATH } from '../utils/PathTracker';
import Identifier from './Identifier';
import * as NodeType from './NodeType';
import ObjectPattern from './ObjectPattern';
import { NodeBase } from './shared/Node';
export default class AssignmentExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.isConstReassignment = false;
    }
    hasEffects(context) {
        const { deoptimized, isConstReassignment, left, operator, right } = this;
        if (!deoptimized)
            this.applyDeoptimizations();
        // MemberExpressions do not access the property before assignments if the
        // operator is '='.
        return (isConstReassignment ||
            right.hasEffects(context) ||
            left.hasEffectsAsAssignmentTarget(context, operator !== '=') ||
            this.left.hasEffectsWhenDestructuring?.(context, EMPTY_PATH, right));
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        return this.right.hasEffectsOnInteractionAtPath(path, interaction, context);
    }
    include(context, includeChildrenRecursively) {
        const { deoptimized, isConstReassignment, left, right, operator } = this;
        if (!deoptimized)
            this.applyDeoptimizations();
        if (!this.included)
            this.includeNode(context);
        const hasEffectsContext = createHasEffectsContext();
        if (includeChildrenRecursively ||
            isConstReassignment ||
            operator !== '=' ||
            left.included ||
            left.hasEffectsAsAssignmentTarget(hasEffectsContext, false) ||
            left.hasEffectsWhenDestructuring?.(hasEffectsContext, EMPTY_PATH, right)) {
            left.includeAsAssignmentTarget(context, includeChildrenRecursively, operator !== '=');
        }
        right.include(context, includeChildrenRecursively);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.right.includePath(UNKNOWN_PATH, context);
    }
    initialise() {
        super.initialise();
        if (this.left instanceof Identifier) {
            const variable = this.scope.variables.get(this.left.name);
            if (variable?.kind === 'const') {
                this.isConstReassignment = true;
                this.scope.context.log(LOGLEVEL_WARN, logConstVariableReassignError(), this.left.start);
            }
        }
        this.left.setAssignedValue(this.right);
    }
    render(code, options, { preventASI, renderedParentType, renderedSurroundingElement } = BLANK) {
        const { left, right, start, end, parent } = this;
        if (left.included) {
            left.render(code, options);
            right.render(code, options);
        }
        else {
            const inclusionStart = findNonWhiteSpace(code.original, findFirstOccurrenceOutsideComment(code.original, '=', left.end) + 1);
            code.remove(start, inclusionStart);
            if (preventASI) {
                removeLineBreaks(code, inclusionStart, right.start);
            }
            right.render(code, options, {
                renderedParentType: renderedParentType || parent.type,
                renderedSurroundingElement: renderedSurroundingElement || parent.type
            });
        }
        if (options.format === 'system') {
            if (left instanceof Identifier) {
                const variable = left.variable;
                const exportNames = options.exportNamesByVariable.get(variable);
                if (exportNames) {
                    if (exportNames.length === 1) {
                        renderSystemExportExpression(variable, start, end, code, options);
                    }
                    else {
                        renderSystemExportSequenceAfterExpression(variable, start, end, parent.type !== NodeType.ExpressionStatement, code, options);
                    }
                    return;
                }
            }
            else {
                const systemPatternExports = [];
                left.addExportedVariables(systemPatternExports, options.exportNamesByVariable);
                if (systemPatternExports.length > 0) {
                    renderSystemExportFunction(systemPatternExports, start, end, renderedSurroundingElement === NodeType.ExpressionStatement, code, options);
                    return;
                }
            }
        }
        if (left.included &&
            left instanceof ObjectPattern &&
            (renderedSurroundingElement === NodeType.ExpressionStatement ||
                renderedSurroundingElement === NodeType.ArrowFunctionExpression)) {
            code.appendRight(start, '(');
            code.prependLeft(end, ')');
        }
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        this.left.deoptimizeAssignment(EMPTY_PATH, this.right);
        this.scope.context.requestTreeshakingPass();
    }
}
