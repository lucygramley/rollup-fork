import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ImportDefaultSpecifier extends NodeBase {
}
ImportDefaultSpecifier.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ImportDefaultSpecifier.prototype.applyDeoptimizations = doNotDeoptimize;
