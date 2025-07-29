import { logRedeclarationError } from '../../utils/logs';
import { EMPTY_PATH } from '../utils/PathTracker';
import { UNDEFINED_EXPRESSION } from '../values';
import ExportDefaultVariable from '../variables/ExportDefaultVariable';
import GlobalVariable from '../variables/GlobalVariable';
import LocalVariable from '../variables/LocalVariable';
import ChildScope from './ChildScope';
export default class ModuleScope extends ChildScope {
    constructor(parent, context) {
        super(parent, context);
        this.variables.set('this', new LocalVariable('this', null, UNDEFINED_EXPRESSION, EMPTY_PATH, context, 'other'));
    }
    addDeclaration(identifier, context, init, destructuredInitPath, kind) {
        if (this.context.module.importDescriptions.has(identifier.name)) {
            context.error(logRedeclarationError(identifier.name), identifier.start);
        }
        return super.addDeclaration(identifier, context, init, destructuredInitPath, kind);
    }
    addExportDefaultDeclaration(name, exportDefaultDeclaration, context) {
        const variable = new ExportDefaultVariable(name, exportDefaultDeclaration, context);
        this.variables.set('default', variable);
        return variable;
    }
    addNamespaceMemberAccess() { }
    deconflict(format, exportNamesByVariable, accessedGlobalsByScope) {
        // all module level variables are already deconflicted when deconflicting the chunk
        for (const scope of this.children)
            scope.deconflict(format, exportNamesByVariable, accessedGlobalsByScope);
    }
    findLexicalBoundary() {
        return this;
    }
    findVariable(name) {
        const knownVariable = this.variables.get(name) || this.accessedOutsideVariables.get(name);
        if (knownVariable) {
            return knownVariable;
        }
        const variable = this.context.traceVariable(name) || this.parent.findVariable(name);
        if (variable instanceof GlobalVariable) {
            this.accessedOutsideVariables.set(name, variable);
        }
        return variable;
    }
}
