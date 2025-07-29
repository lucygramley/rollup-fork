import { logRedeclarationError } from '../../utils/logs';
import ChildScope from './ChildScope';
export default class BlockScope extends ChildScope {
    constructor(parent) {
        super(parent, parent.context);
    }
    addDeclaration(identifier, context, init, destructuredInitPath, kind) {
        if (kind === 'var') {
            const name = identifier.name;
            const existingVariable = this.hoistedVariables?.get(name) || this.variables.get(name);
            if (existingVariable) {
                if (existingVariable.kind === 'var' ||
                    (kind === 'var' && existingVariable.kind === 'parameter')) {
                    existingVariable.addDeclaration(identifier, init);
                    return existingVariable;
                }
                return context.error(logRedeclarationError(name), identifier.start);
            }
            const declaredVariable = this.parent.addDeclaration(identifier, context, init, destructuredInitPath, kind);
            // Necessary to make sure the init is deoptimized for conditional declarations.
            // We cannot call deoptimizePath here.
            declaredVariable.markInitializersForDeoptimization();
            // We add the variable to this and all parent scopes to reliably detect conflicts
            this.addHoistedVariable(name, declaredVariable);
            return declaredVariable;
        }
        return super.addDeclaration(identifier, context, init, destructuredInitPath, kind);
    }
}
