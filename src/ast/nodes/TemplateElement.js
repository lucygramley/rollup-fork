import { isFlagSet, setFlag } from './shared/BitFlags';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class TemplateElement extends NodeBase {
    get tail() {
        return isFlagSet(this.flags, 1048576 /* Flag.tail */);
    }
    set tail(value) {
        this.flags = setFlag(this.flags, 1048576 /* Flag.tail */, value);
    }
    // Do not try to bind value
    bind() { }
    hasEffects() {
        return false;
    }
    parseNode(esTreeNode) {
        this.value = esTreeNode.value;
        return super.parseNode(esTreeNode);
    }
    render() { }
}
TemplateElement.prototype.includeNode = onlyIncludeSelf;
