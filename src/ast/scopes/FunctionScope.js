import { UNKNOWN_PATH } from '../utils/PathTracker';
import ArgumentsVariable from '../variables/ArgumentsVariable';
import ThisVariable from '../variables/ThisVariable';
import ReturnValueScope from './ReturnValueScope';
export default class FunctionScope extends ReturnValueScope {
    constructor(parent, functionNode) {
        super(parent, false);
        this.functionNode = functionNode;
        const { context } = parent;
        this.variables.set('arguments', (this.argumentsVariable = new ArgumentsVariable(context)));
        this.variables.set('this', (this.thisVariable = new ThisVariable(context)));
    }
    findLexicalBoundary() {
        return this;
    }
    includeCallArguments(interaction, context) {
        super.includeCallArguments(interaction, context);
        if (this.argumentsVariable.included) {
            const { args } = interaction;
            for (let argumentIndex = 1; argumentIndex < args.length; argumentIndex++) {
                const argument = args[argumentIndex];
                if (argument) {
                    argument.includePath(UNKNOWN_PATH, context);
                    argument.include(context, false);
                }
            }
        }
    }
    addArgumentToBeDeoptimized(argument) {
        this.argumentsVariable.addArgumentToBeDeoptimized(argument);
    }
}
