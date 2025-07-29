import { UNKNOWN_PATH } from '../../utils/PathTracker';
import LocalVariable from '../../variables/LocalVariable';
export function getAndIncludeFactoryVariable(factory, preserve, importSource, node, context) {
    const [baseName, nestedName] = factory.split('.');
    let factoryVariable;
    if (importSource) {
        factoryVariable = node.scope.context.getImportedJsxFactoryVariable(nestedName ? 'default' : baseName, node.start, importSource);
        if (preserve) {
            // This pretends we are accessing an included global variable of the same name
            const globalVariable = node.scope.findGlobal(baseName);
            globalVariable.includePath(UNKNOWN_PATH, context);
            // This excludes this variable from renaming
            factoryVariable.globalName = baseName;
        }
    }
    else {
        factoryVariable = node.scope.findGlobal(baseName);
    }
    node.scope.context.includeVariableInModule(factoryVariable, UNKNOWN_PATH, context);
    if (factoryVariable instanceof LocalVariable) {
        factoryVariable.consolidateInitializers();
        factoryVariable.addUsedPlace(node);
        node.scope.context.requestTreeshakingPass();
    }
    return factoryVariable;
}
