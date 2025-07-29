import * as nodeType from '../nodes/NodeType';
import { NodeBase } from '../nodes/shared/Node';
export function isObjectExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.ObjectExpression;
}
export function isPropertyNode(node) {
    return node instanceof NodeBase && node.type === nodeType.Property;
}
export function isArrowFunctionExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.ArrowFunctionExpression;
}
export function isFunctionExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.FunctionExpression;
}
export function isCallExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.CallExpression;
}
export function isMemberExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.MemberExpression;
}
export function isImportExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.ImportExpression;
}
export function isAwaitExpressionNode(node) {
    return node instanceof NodeBase && node.type === nodeType.AwaitExpression;
}
export function isIdentifierNode(node) {
    return node instanceof NodeBase && node.type === nodeType.Identifier;
}
