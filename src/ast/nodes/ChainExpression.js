import { doNotDeoptimize, IS_SKIPPED_CHAIN, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ChainExpression extends NodeBase {
    // deoptimizations are not relevant as we are not caching values
    deoptimizeCache() { }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const literalValue = this.expression.getLiteralValueAtPathAsChainElement(path, recursionTracker, origin);
        return literalValue === IS_SKIPPED_CHAIN ? undefined : literalValue;
    }
    hasEffects(context) {
        return this.expression.hasEffectsAsChainElement(context) === true;
    }
    includePath(path, context) {
        this.included = true;
        this.expression.includePath(path, context);
    }
    removeAnnotations(code) {
        this.expression.removeAnnotations(code);
    }
}
ChainExpression.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ChainExpression.prototype.applyDeoptimizations = doNotDeoptimize;
