import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class PrivateIdentifier extends NodeBase {
}
PrivateIdentifier.prototype.includeNode = onlyIncludeSelf;
