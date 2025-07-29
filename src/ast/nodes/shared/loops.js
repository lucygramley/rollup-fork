export function hasLoopBodyEffects(context, body) {
    const { brokenFlow, hasBreak, hasContinue, ignore } = context;
    const { breaks, continues } = ignore;
    ignore.breaks = true;
    ignore.continues = true;
    context.hasBreak = false;
    context.hasContinue = false;
    if (body.hasEffects(context))
        return true;
    ignore.breaks = breaks;
    ignore.continues = continues;
    context.hasBreak = hasBreak;
    context.hasContinue = hasContinue;
    context.brokenFlow = brokenFlow;
    return false;
}
export function includeLoopBody(context, body, includeChildrenRecursively) {
    const { brokenFlow, hasBreak, hasContinue } = context;
    context.hasBreak = false;
    context.hasContinue = false;
    body.include(context, includeChildrenRecursively, { asSingleStatement: true });
    context.hasBreak = hasBreak;
    context.hasContinue = hasContinue;
    context.brokenFlow = brokenFlow;
}
