import { UNKNOWN_PATH } from '../../utils/PathTracker';
import { isFlagSet, setFlag } from './BitFlags';
export const UnknownValue = Symbol('Unknown Value');
export const UnknownTruthyValue = Symbol('Unknown Truthy Value');
export const UnknownFalsyValue = Symbol('Unknown Falsy Value');
export class ExpressionEntity {
    constructor() {
        this.flags = 0;
    }
    get included() {
        return isFlagSet(this.flags, 1 /* Flag.included */);
    }
    set included(value) {
        this.flags = setFlag(this.flags, 1 /* Flag.included */, value);
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, _path, _recursionTracker) {
        deoptimizeInteraction(interaction);
    }
    deoptimizePath(_path) { }
    /**
     * If possible it returns a stringifyable literal value for this node that
     * can be used for inlining or comparing values. Otherwise, it should return
     * UnknownValue.
     */
    getLiteralValueAtPath(_path, _recursionTracker, _origin) {
        return UnknownValue;
    }
    getReturnExpressionWhenCalledAtPath(_path, _interaction, _recursionTracker, _origin) {
        return UNKNOWN_RETURN_EXPRESSION;
    }
    hasEffectsOnInteractionAtPath(_path, _interaction, _context) {
        return true;
    }
    include(context, _includeChildrenRecursively, _options) {
        if (!this.included)
            this.includeNode(context);
    }
    includeNode(_context) {
        this.included = true;
    }
    includePath(_path, context) {
        if (!this.included)
            this.includeNode(context);
    }
    /* We are both including and including an unknown path here as the former
     * ensures that nested nodes are included while the latter ensures that all
     * paths of the expression are included.
     * */
    includeCallArguments(interaction, context) {
        includeInteraction(interaction, context);
    }
    shouldBeIncluded(_context) {
        return true;
    }
}
export const UNKNOWN_EXPRESSION = new (class UnknownExpression extends ExpressionEntity {
})();
export const UNKNOWN_RETURN_EXPRESSION = [
    UNKNOWN_EXPRESSION,
    false
];
export const deoptimizeInteraction = (interaction) => {
    for (const argument of interaction.args) {
        argument?.deoptimizePath(UNKNOWN_PATH);
    }
};
export const includeInteraction = (interaction, context) => {
    // We do not re-include the "this" argument as we expect this is already
    // re-included at the call site
    interaction.args[0]?.includePath(UNKNOWN_PATH, context);
    includeInteractionWithoutThis(interaction, context);
};
export const includeInteractionWithoutThis = ({ args }, context) => {
    for (let argumentIndex = 1; argumentIndex < args.length; argumentIndex++) {
        const argument = args[argumentIndex];
        if (argument) {
            argument.includePath(UNKNOWN_PATH, context);
            argument.include(context, false);
        }
    }
};
