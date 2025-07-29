import { logRedeclarationError } from '../../utils/logs';
import LocalVariable from '../variables/LocalVariable';
import ChildScope from './ChildScope';
export default class FunctionBodyScope extends ChildScope {
    constructor(parent) {
        super(parent, parent.context);
    }
    // There is stuff that is only allowed in function scopes, i.e. functions can
    // be redeclared, functions and var can redeclare each other
    addDeclaration(identifier, context, init, destructuredInitPath, kind) {
        const name = identifier.name;
        const existingVariable = this.hoistedVariables?.get(name) || this.variables.get(name);
        if (existingVariable) {
            const existingKind = existingVariable.kind;
            if ((kind === 'var' || kind === 'function') &&
                (existingKind === 'var' || existingKind === 'function' || existingKind === 'parameter')) {
                existingVariable.addDeclaration(identifier, init);
                return existingVariable;
            }
            context.error(logRedeclarationError(name), identifier.start);
        }
        const newVariable = new LocalVariable(identifier.name, identifier, init, destructuredInitPath, context, kind);
        this.variables.set(name, newVariable);
        return newVariable;
    }
}
