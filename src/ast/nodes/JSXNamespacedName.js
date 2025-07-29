import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class JSXNamespacedName extends NodeBase {
}
JSXNamespacedName.prototype.includeNode = onlyIncludeSelf;
