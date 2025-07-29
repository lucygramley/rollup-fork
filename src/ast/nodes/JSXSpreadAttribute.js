import { NodeBase } from './shared/Node';
export default class JSXSpreadAttribute extends NodeBase {
    render(code, options) {
        this.argument.render(code, options);
        const { mode } = this.scope.context.options.jsx;
        if (mode !== 'preserve') {
            code.overwrite(this.start, this.argument.start, '', { contentOnly: true });
            code.overwrite(this.argument.end, this.end, '', { contentOnly: true });
        }
    }
}
