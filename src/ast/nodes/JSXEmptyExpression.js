import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class JSXEmptyExpression extends NodeBase {
}
JSXEmptyExpression.prototype.includeNode = onlyIncludeSelf;
