import { INTERACTION_ACCESSED, NODE_INTERACTION_UNKNOWN_ASSIGNMENT } from '../NodeInteractions';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER } from '../utils/PathTracker';
import { getRenderedLiteralValue } from '../utils/renderLiteralValue';
import Identifier from './Identifier';
import { isFlagSet, setFlag } from './shared/BitFlags';
import { UnknownFalsyValue, UnknownTruthyValue, UnknownValue } from './shared/Expression';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
const unaryOperators = {
    '!': value => !value,
    '+': value => +value,
    '-': value => -value,
    delete: () => UnknownValue,
    typeof: value => typeof value,
    void: () => undefined,
    '~': value => ~value
};
const UNASSIGNED = Symbol('Unassigned');
export default class UnaryExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.renderedLiteralValue = UNASSIGNED;
    }
    get prefix() {
        return isFlagSet(this.flags, 2097152 /* Flag.prefix */);
    }
    set prefix(value) {
        this.flags = setFlag(this.flags, 2097152 /* Flag.prefix */, value);
    }
    deoptimizeCache() {
        this.renderedLiteralValue = UnknownValue;
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        if (path.length > 0)
            return UnknownValue;
        const argumentValue = this.argument.getLiteralValueAtPath(EMPTY_PATH, recursionTracker, origin);
        if (typeof argumentValue === 'symbol') {
            if (this.operator === 'void')
                return undefined;
            if (this.operator === '!') {
                if (argumentValue === UnknownFalsyValue)
                    return true;
                if (argumentValue === UnknownTruthyValue)
                    return false;
            }
            return UnknownValue;
        }
        return unaryOperators[this.operator](argumentValue);
    }
    hasEffects(context) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        if (this.operator === 'typeof' && this.argument instanceof Identifier)
            return false;
        return (this.argument.hasEffects(context) ||
            (this.operator === 'delete' &&
                this.argument.hasEffectsOnInteractionAtPath(EMPTY_PATH, NODE_INTERACTION_UNKNOWN_ASSIGNMENT, context)));
    }
    hasEffectsOnInteractionAtPath(path, { type }) {
        return type !== INTERACTION_ACCESSED || path.length > (this.operator === 'void' ? 0 : 1);
    }
    applyDeoptimizations() {
        this.deoptimized = true;
        if (this.operator === 'delete') {
            this.argument.deoptimizePath(EMPTY_PATH);
            this.scope.context.requestTreeshakingPass();
        }
    }
    getRenderedLiteralValue(includeChildrenRecursively) {
        if (this.renderedLiteralValue !== UNASSIGNED)
            return this.renderedLiteralValue;
        return (this.renderedLiteralValue = includeChildrenRecursively
            ? UnknownValue
            : getRenderedLiteralValue(this.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this)));
    }
    include(context, includeChildrenRecursively, _options) {
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.included = true;
        // Check if the argument is an identifier that should be preserved as a reference for readability
        const shouldPreserveArgument = this.argument instanceof Identifier && this.argument.variable?.included;
        if (typeof this.getRenderedLiteralValue(includeChildrenRecursively) === 'symbol' ||
            this.argument.shouldBeIncluded(context) ||
            shouldPreserveArgument) {
            this.argument.include(context, includeChildrenRecursively);
            this.renderedLiteralValue = UnknownValue;
        }
    }
    render(code, options) {
        if (typeof this.renderedLiteralValue === 'symbol') {
            super.render(code, options);
        }
        else {
            let value = this.renderedLiteralValue;
            if (!CHARACTERS_THAT_DO_NOT_REQUIRE_SPACE.test(code.original[this.start - 1])) {
                value = ` ${value}`;
            }
            code.overwrite(this.start, this.end, value);
        }
    }
}
const CHARACTERS_THAT_DO_NOT_REQUIRE_SPACE = /[\s([=%&*+-/<>^|,?:;]/;
UnaryExpression.prototype.includeNode = onlyIncludeSelf;
