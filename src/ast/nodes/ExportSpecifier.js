import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ExportSpecifier extends NodeBase {
}
ExportSpecifier.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ExportSpecifier.prototype.applyDeoptimizations = doNotDeoptimize;
