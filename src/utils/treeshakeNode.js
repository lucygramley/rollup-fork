export function treeshakeNode(node, code, start, end) {
    code.remove(start, end);
    node.removeAnnotations(code);
}
