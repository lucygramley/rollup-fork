import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ImportSpecifier extends NodeBase {
}
ImportSpecifier.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ImportSpecifier.prototype.applyDeoptimizations = doNotDeoptimize;
