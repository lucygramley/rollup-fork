export function checkEffectForNodes(nodes, context) {
    for (const node of nodes) {
        if (node.hasEffects(context)) {
            return true;
        }
    }
    return false;
}
