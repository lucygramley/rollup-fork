import { BLANK, EMPTY_ARRAY } from '../../utils/blank';
import { findFirstOccurrenceOutsideComment, findNonWhiteSpace, removeLineBreaks } from '../../utils/renderHelpers';
import { createInclusionContext } from '../ExecutionContext';
import { EMPTY_PATH, SHARED_RECURSION_TRACKER, UNKNOWN_PATH } from '../utils/PathTracker';
import { tryCastLiteralValueToBoolean } from '../utils/tryCastLiteralValueToBoolean';
import { isFlagSet, setFlag } from './shared/BitFlags';
import { UnknownFalsyValue, UnknownTruthyValue, UnknownValue } from './shared/Expression';
import { MultiExpression } from './shared/MultiExpression';
import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ConditionalExpression extends NodeBase {
    constructor() {
        super(...arguments);
        this.expressionsToBeDeoptimized = [];
        this.usedBranch = null;
    }
    get isBranchResolutionAnalysed() {
        return isFlagSet(this.flags, 65536 /* Flag.isBranchResolutionAnalysed */);
    }
    set isBranchResolutionAnalysed(value) {
        this.flags = setFlag(this.flags, 65536 /* Flag.isBranchResolutionAnalysed */, value);
    }
    get hasDeoptimizedCache() {
        return isFlagSet(this.flags, 33554432 /* Flag.hasDeoptimizedCache */);
    }
    set hasDeoptimizedCache(value) {
        this.flags = setFlag(this.flags, 33554432 /* Flag.hasDeoptimizedCache */, value);
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        this.consequent.deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
        this.alternate.deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker);
    }
    deoptimizeCache() {
        if (this.hasDeoptimizedCache)
            return;
        this.hasDeoptimizedCache = true;
        if (this.usedBranch !== null) {
            const unusedBranch = this.usedBranch === this.consequent ? this.alternate : this.consequent;
            this.usedBranch = null;
            unusedBranch.deoptimizePath(UNKNOWN_PATH);
            if (this.included) {
                unusedBranch.includePath(UNKNOWN_PATH, createInclusionContext());
            }
            const { expressionsToBeDeoptimized } = this;
            this.expressionsToBeDeoptimized = EMPTY_ARRAY;
            for (const expression of expressionsToBeDeoptimized) {
                expression.deoptimizeCache();
            }
        }
    }
    deoptimizePath(path) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch) {
            usedBranch.deoptimizePath(path);
        }
        else {
            this.consequent.deoptimizePath(path);
            this.alternate.deoptimizePath(path);
        }
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        const usedBranch = this.getUsedBranch();
        if (!usedBranch) {
            if (this.hasDeoptimizedCache) {
                return UnknownValue;
            }
            const consequentValue = this.consequent.getLiteralValueAtPath(path, recursionTracker, origin);
            const castedConsequentValue = tryCastLiteralValueToBoolean(consequentValue);
            if (castedConsequentValue === UnknownValue)
                return UnknownValue;
            const alternateValue = this.alternate.getLiteralValueAtPath(path, recursionTracker, origin);
            const castedAlternateValue = tryCastLiteralValueToBoolean(alternateValue);
            if (castedConsequentValue !== castedAlternateValue)
                return UnknownValue;
            this.expressionsToBeDeoptimized.push(origin);
            if (consequentValue !== alternateValue)
                return castedConsequentValue ? UnknownTruthyValue : UnknownFalsyValue;
            return consequentValue;
        }
        this.expressionsToBeDeoptimized.push(origin);
        return usedBranch.getLiteralValueAtPath(path, recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin) {
        const usedBranch = this.getUsedBranch();
        if (!usedBranch)
            return [
                new MultiExpression([
                    this.consequent.getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin)[0],
                    this.alternate.getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin)[0]
                ]),
                false
            ];
        this.expressionsToBeDeoptimized.push(origin);
        return usedBranch.getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin);
    }
    hasEffects(context) {
        if (this.test.hasEffects(context))
            return true;
        const usedBranch = this.getUsedBranch();
        if (!usedBranch) {
            return this.consequent.hasEffects(context) || this.alternate.hasEffects(context);
        }
        return usedBranch.hasEffects(context);
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        const usedBranch = this.getUsedBranch();
        if (!usedBranch) {
            return (this.consequent.hasEffectsOnInteractionAtPath(path, interaction, context) ||
                this.alternate.hasEffectsOnInteractionAtPath(path, interaction, context));
        }
        return usedBranch.hasEffectsOnInteractionAtPath(path, interaction, context);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null || includeChildrenRecursively || this.test.shouldBeIncluded(context)) {
            this.test.include(context, includeChildrenRecursively);
            this.consequent.include(context, includeChildrenRecursively);
            this.alternate.include(context, includeChildrenRecursively);
        }
        else {
            usedBranch.include(context, includeChildrenRecursively);
        }
    }
    includePath(path, context) {
        this.included = true;
        const usedBranch = this.getUsedBranch();
        if (usedBranch === null || this.test.shouldBeIncluded(context)) {
            this.consequent.includePath(path, context);
            this.alternate.includePath(path, context);
        }
        else {
            usedBranch.includePath(path, context);
        }
    }
    includeCallArguments(interaction, context) {
        const usedBranch = this.getUsedBranch();
        if (usedBranch) {
            usedBranch.includeCallArguments(interaction, context);
        }
        else {
            this.consequent.includeCallArguments(interaction, context);
            this.alternate.includeCallArguments(interaction, context);
        }
    }
    removeAnnotations(code) {
        this.test.removeAnnotations(code);
    }
    render(code, options, { isCalleeOfRenderedParent, preventASI, renderedParentType, renderedSurroundingElement } = BLANK) {
        if (this.test.included) {
            this.test.render(code, options, { renderedSurroundingElement });
            this.consequent.render(code, options);
            this.alternate.render(code, options);
        }
        else {
            const usedBranch = this.getUsedBranch();
            const colonPos = findFirstOccurrenceOutsideComment(code.original, ':', this.consequent.end);
            const inclusionStart = findNonWhiteSpace(code.original, (this.consequent.included
                ? findFirstOccurrenceOutsideComment(code.original, '?', this.test.end)
                : colonPos) + 1);
            if (preventASI) {
                removeLineBreaks(code, inclusionStart, usedBranch.start);
            }
            code.remove(this.start, inclusionStart);
            if (this.consequent.included) {
                code.remove(colonPos, this.end);
            }
            this.test.removeAnnotations(code);
            usedBranch.render(code, options, {
                isCalleeOfRenderedParent,
                preventASI: true,
                renderedParentType: renderedParentType || this.parent.type,
                renderedSurroundingElement: renderedSurroundingElement || this.parent.type
            });
        }
    }
    getUsedBranch() {
        if (this.isBranchResolutionAnalysed) {
            return this.usedBranch;
        }
        this.isBranchResolutionAnalysed = true;
        const testValue = tryCastLiteralValueToBoolean(this.test.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, this));
        return typeof testValue === 'symbol'
            ? null
            : (this.usedBranch = testValue ? this.consequent : this.alternate);
    }
}
ConditionalExpression.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ConditionalExpression.prototype.applyDeoptimizations = doNotDeoptimize;
