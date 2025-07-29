import { NodeBase, onlyIncludeSelf } from './Node';
export default class JSXClosingBase extends NodeBase {
    render(code, options) {
        const { mode } = this.scope.context.options.jsx;
        if (mode !== 'preserve') {
            code.overwrite(this.start, this.end, ')', { contentOnly: true });
        }
        else {
            super.render(code, options);
        }
    }
}
JSXClosingBase.prototype.includeNode = onlyIncludeSelf;
