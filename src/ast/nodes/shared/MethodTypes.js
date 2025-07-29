import { INTERACTION_ACCESSED, INTERACTION_CALLED, NODE_INTERACTION_UNKNOWN_ASSIGNMENT, NODE_INTERACTION_UNKNOWN_CALL } from '../../NodeInteractions';
import { EMPTY_PATH, UNKNOWN_INTEGER_PATH, UNKNOWN_PATH } from '../../utils/PathTracker';
import { UNKNOWN_LITERAL_BOOLEAN, UNKNOWN_LITERAL_NUMBER, UNKNOWN_LITERAL_STRING } from '../../values';
import { ExpressionEntity, UNKNOWN_EXPRESSION, UNKNOWN_RETURN_EXPRESSION } from './Expression';
export class Method extends ExpressionEntity {
    constructor(description) {
        super();
        this.description = description;
    }
    deoptimizeArgumentsOnInteractionAtPath({ args, type }, path) {
        if (type === INTERACTION_CALLED && path.length === 0) {
            if (this.description.mutatesSelfAsArray) {
                args[0]?.deoptimizePath(UNKNOWN_INTEGER_PATH);
            }
            if (this.description.mutatesArgs) {
                for (let index = 1; index < args.length; index++) {
                    args[index].deoptimizePath(UNKNOWN_PATH);
                }
            }
        }
    }
    getReturnExpressionWhenCalledAtPath(path, { args }) {
        if (path.length > 0) {
            return UNKNOWN_RETURN_EXPRESSION;
        }
        return [
            this.description.returnsPrimitive ||
                (this.description.returns === 'self'
                    ? args[0] || UNKNOWN_EXPRESSION
                    : this.description.returns()),
            false
        ];
    }
    hasEffectsOnInteractionAtPath(path, { args, type }, context) {
        if (path.length > (type === INTERACTION_ACCESSED ? 1 : 0)) {
            return true;
        }
        if (type === INTERACTION_CALLED) {
            if (this.description.mutatesSelfAsArray === true &&
                args[0]?.hasEffectsOnInteractionAtPath(UNKNOWN_INTEGER_PATH, NODE_INTERACTION_UNKNOWN_ASSIGNMENT, context)) {
                return true;
            }
            if (this.description.callsArgs) {
                for (const argumentIndex of this.description.callsArgs) {
                    if (args[argumentIndex + 1]?.hasEffectsOnInteractionAtPath(EMPTY_PATH, NODE_INTERACTION_UNKNOWN_CALL, context)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
export const METHOD_RETURNS_BOOLEAN = [
    new Method({
        callsArgs: null,
        mutatesArgs: false,
        mutatesSelfAsArray: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_BOOLEAN
    })
];
export const METHOD_RETURNS_STRING = [
    new Method({
        callsArgs: null,
        mutatesArgs: false,
        mutatesSelfAsArray: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_STRING
    })
];
export const METHOD_RETURNS_NUMBER = [
    new Method({
        callsArgs: null,
        mutatesArgs: false,
        mutatesSelfAsArray: false,
        returns: null,
        returnsPrimitive: UNKNOWN_LITERAL_NUMBER
    })
];
export const METHOD_RETURNS_UNKNOWN = [
    new Method({
        callsArgs: null,
        mutatesArgs: false,
        mutatesSelfAsArray: false,
        returns: null,
        returnsPrimitive: UNKNOWN_EXPRESSION
    })
];
