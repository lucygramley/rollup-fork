import { doNotDeoptimize, NodeBase, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class ImportNamespaceSpecifier extends NodeBase {
}
ImportNamespaceSpecifier.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
ImportNamespaceSpecifier.prototype.applyDeoptimizations = doNotDeoptimize;
