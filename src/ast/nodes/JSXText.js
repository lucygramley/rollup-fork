import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class JSXText extends NodeBase {
    render(code) {
        const { mode } = this.scope.context.options.jsx;
        if (mode !== 'preserve') {
            code.overwrite(this.start, this.end, JSON.stringify(this.value), {
                contentOnly: true
            });
        }
    }
}
JSXText.prototype.includeNode = onlyIncludeSelf;
