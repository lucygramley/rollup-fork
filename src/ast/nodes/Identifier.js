import isReference from 'is-reference';
import '../../../typings/declarations';
import { BLANK } from '../../utils/blank';
import { createHasEffectsContext } from '../ExecutionContext';
import { INTERACTION_ACCESSED, NODE_INTERACTION_UNKNOWN_ACCESS } from '../NodeInteractions';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER, UnknownKey } from '../utils/PathTracker';
import * as NodeType from './NodeType';
import { isFlagSet, setFlag } from './shared/BitFlags';
import IdentifierBase from './shared/IdentifierBase';
import { ObjectMember } from './shared/ObjectMember';
export default class Identifier extends IdentifierBase {
    constructor() {
        super(...arguments);
        this.variable = null;
    }
    get isDestructuringDeoptimized() {
        return isFlagSet(this.flags, 16777216 /* Flag.destructuringDeoptimized */);
    }
    set isDestructuringDeoptimized(value) {
        this.flags = setFlag(this.flags, 16777216 /* Flag.destructuringDeoptimized */, value);
    }
    addExportedVariables(variables, exportNamesByVariable) {
        if (exportNamesByVariable.has(this.variable)) {
            variables.push(this.variable);
        }
    }
    bind() {
        if (!this.variable && isReference(this, this.parent)) {
            this.variable = this.scope.findVariable(this.name);
            this.variable.addReference(this);
            this.isVariableReference = true;
        }
    }
    declare(kind, destructuredInitPath, init) {
        let variable;
        const { treeshake } = this.scope.context.options;
        if (kind === 'parameter') {
            variable = this.scope.addParameterDeclaration(this, destructuredInitPath);
        }
        else {
            variable = this.scope.addDeclaration(this, this.scope.context, init, destructuredInitPath, kind);
            if (kind === 'var' && treeshake && treeshake.correctVarValueBeforeDeclaration) {
                // Necessary to make sure the init is deoptimized. We cannot call deoptimizePath here.
                variable.markInitializersForDeoptimization();
            }
        }
        return [(this.variable = variable)];
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        this.deoptimizePath(EMPTY_PATH);
        init.deoptimizePath([...destructuredInitPath, UnknownKey]);
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        return (destructuredInitPath.length > 0 &&
            init.hasEffectsOnInteractionAtPath(destructuredInitPath, NODE_INTERACTION_UNKNOWN_ACCESS, context));
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        if (destructuredInitPath.length > 0 && !this.isDestructuringDeoptimized) {
            this.isDestructuringDeoptimized = true;
            init.deoptimizeArgumentsOnInteractionAtPath({
                args: [new ObjectMember(init, destructuredInitPath.slice(0, -1))],
                type: INTERACTION_ACCESSED
            }, destructuredInitPath, SHARED_RECURSION_TRACKER);
        }
        const { propertyReadSideEffects } = this.scope.context.options
            .treeshake;
        if ((this.included ||=
            destructuredInitPath.length > 0 &&
                !context.brokenFlow &&
                propertyReadSideEffects &&
                (propertyReadSideEffects === 'always' ||
                    init.hasEffectsOnInteractionAtPath(destructuredInitPath, NODE_INTERACTION_UNKNOWN_ACCESS, createHasEffectsContext())))) {
            if (this.variable && !this.variable.included) {
                this.scope.context.includeVariableInModule(this.variable, EMPTY_PATH, context);
            }
            init.includePath(destructuredInitPath, context);
            return true;
        }
        return false;
    }
    markDeclarationReached() {
        this.variable.initReached = true;
    }
    render(code, { snippets: { getPropertyAccess }, useOriginalName }, { renderedParentType, isCalleeOfRenderedParent, isShorthandProperty } = BLANK) {
        if (this.variable) {
            const name = this.variable.getName(getPropertyAccess, useOriginalName);
            if (name !== this.name) {
                code.overwrite(this.start, this.end, name, {
                    contentOnly: true,
                    storeName: true
                });
                if (isShorthandProperty) {
                    code.prependRight(this.start, `${this.name}: `);
                }
            }
            // In strict mode, any variable named "eval" must be the actual "eval" function
            if (name === 'eval' &&
                renderedParentType === NodeType.CallExpression &&
                isCalleeOfRenderedParent) {
                code.appendRight(this.start, '0, ');
            }
        }
    }
}
