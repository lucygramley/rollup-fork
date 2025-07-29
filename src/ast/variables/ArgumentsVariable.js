import { INTERACTION_ACCESSED } from '../NodeInteractions';
import { UNKNOWN_EXPRESSION } from '../nodes/shared/Expression';
import { EMPTY_PATH, UNKNOWN_PATH } from '../utils/PathTracker';
import LocalVariable from './LocalVariable';
export default class ArgumentsVariable extends LocalVariable {
    constructor(context) {
        super('arguments', null, UNKNOWN_EXPRESSION, EMPTY_PATH, context, 'other');
    }
    addArgumentToBeDeoptimized(_argument) { }
    // Only If there is at least one reference, then we need to track all
    // arguments in order to be able to deoptimize them.
    addReference() {
        this.deoptimizedArguments = [];
        this.addArgumentToBeDeoptimized = addArgumentToBeDeoptimized;
    }
    hasEffectsOnInteractionAtPath(path, { type }) {
        return type !== INTERACTION_ACCESSED || path.length > 1;
    }
    includePath(path, context) {
        super.includePath(path, context);
        for (const argument of this.deoptimizedArguments) {
            argument.deoptimizePath(UNKNOWN_PATH);
        }
        this.deoptimizedArguments.length = 0;
    }
}
function addArgumentToBeDeoptimized(argument) {
    if (this.included) {
        argument.deoptimizePath(UNKNOWN_PATH);
    }
    else {
        this.deoptimizedArguments?.push(argument);
    }
}
