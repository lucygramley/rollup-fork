import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class JSXOpeningElement extends NodeBase {
    render(code, options, { jsxMode = this.scope.context.options.jsx.mode } = {}) {
        this.name.render(code, options);
        for (const attribute of this.attributes) {
            attribute.render(code, options, { jsxMode });
        }
    }
}
JSXOpeningElement.prototype.includeNode = onlyIncludeSelf;
