import { NodeBase } from './shared/Node';
export default class JSXSpreadChild extends NodeBase {
    render(code, options) {
        super.render(code, options);
        const { mode } = this.scope.context.options.jsx;
        if (mode !== 'preserve') {
            code.overwrite(this.start, this.expression.start, '...', { contentOnly: true });
            code.overwrite(this.expression.end, this.end, '', { contentOnly: true });
        }
    }
}
