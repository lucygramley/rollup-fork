import { getAndIncludeFactoryVariable } from './shared/jsxHelpers';
import { NodeBase } from './shared/Node';
export default class JSXOpeningFragment extends NodeBase {
    constructor() {
        super(...arguments);
        this.fragment = null;
        this.fragmentVariable = null;
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        const jsx = this.scope.context.options.jsx;
        if (jsx.mode === 'automatic') {
            this.fragment = 'Fragment';
            this.fragmentVariable = getAndIncludeFactoryVariable('Fragment', false, jsx.jsxImportSource, this, context);
        }
        else {
            const { fragment, importSource, mode } = jsx;
            if (fragment != null) {
                this.fragment = fragment;
                this.fragmentVariable = getAndIncludeFactoryVariable(fragment, mode === 'preserve', importSource, this, context);
            }
        }
    }
    render(code, options) {
        const { mode } = this.scope.context.options.jsx;
        if (mode !== 'preserve') {
            const { snippets: { getPropertyAccess }, useOriginalName } = options;
            const [, ...nestedFragment] = this.fragment.split('.');
            const fragment = [
                this.fragmentVariable.getName(getPropertyAccess, useOriginalName),
                ...nestedFragment
            ].join('.');
            code.update(this.start, this.end, fragment);
        }
    }
}
