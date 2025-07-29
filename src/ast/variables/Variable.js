import { INTERACTION_ACCESSED } from '../NodeInteractions';
import * as NodeType from '../nodes/NodeType';
import { ExpressionEntity } from '../nodes/shared/Expression';
export default class Variable extends ExpressionEntity {
    markReassigned() {
        this.isReassigned = true;
    }
    constructor(name) {
        super();
        this.name = name;
        this.alwaysRendered = false;
        this.forbiddenNames = null;
        this.globalName = null;
        this.initReached = false;
        this.isId = false;
        this.kind = null;
        this.renderBaseName = null;
        this.renderName = null;
        this.isReassigned = false;
        this.onlyFunctionCallUsed = true;
    }
    /**
     * Binds identifiers that reference this variable to this variable.
     * Necessary to be able to change variable names.
     */
    addReference(_identifier) { }
    /**
     * Check if the identifier variable is only used as function call
     * @returns true if the variable is only used as function call
     */
    getOnlyFunctionCallUsed() {
        return this.onlyFunctionCallUsed;
    }
    /**
     * Collect the places where the identifier variable is used
     * @param usedPlace Where the variable is used
     */
    addUsedPlace(usedPlace) {
        const isFunctionCall = usedPlace.parent.type === NodeType.CallExpression &&
            usedPlace.parent.callee === usedPlace;
        if (!isFunctionCall && usedPlace.parent.type !== NodeType.ExportDefaultDeclaration) {
            this.onlyFunctionCallUsed = false;
        }
    }
    /**
     * Prevent this variable from being renamed to this name to avoid name
     * collisions
     */
    forbidName(name) {
        (this.forbiddenNames ||= new Set()).add(name);
    }
    getBaseVariableName() {
        return (this.renderedLikeHoisted?.getBaseVariableName() ||
            this.renderBaseName ||
            this.renderName ||
            this.name);
    }
    getName(getPropertyAccess, useOriginalName) {
        if (this.globalName) {
            return this.globalName;
        }
        if (useOriginalName?.(this)) {
            return this.name;
        }
        if (this.renderedLikeHoisted) {
            return this.renderedLikeHoisted.getName(getPropertyAccess, useOriginalName);
        }
        const name = this.renderName || this.name;
        return this.renderBaseName ? `${this.renderBaseName}${getPropertyAccess(name)}` : name;
    }
    hasEffectsOnInteractionAtPath(path, { type }, _context) {
        return type !== INTERACTION_ACCESSED || path.length > 0;
    }
    /**
     * Marks this variable as being part of the bundle, which is usually the case
     * when one of its identifiers becomes part of the bundle. Returns true if it
     * has not been included previously. Once a variable is included, it should
     * take care all its declarations are included.
     */
    includePath(path, context) {
        this.included = true;
        this.renderedLikeHoisted?.includePath(path, context);
    }
    /**
     * Links the rendered name of this variable to another variable and includes
     * this variable if the other variable is included.
     */
    renderLikeHoisted(variable) {
        this.renderedLikeHoisted = variable;
    }
    markCalledFromTryStatement() { }
    setRenderNames(baseName, name) {
        this.renderBaseName = baseName;
        this.renderName = name;
    }
}
