import JSXElementBase from './shared/JSXElementBase';
export default class JSXFragment extends JSXElementBase {
    include(context, includeChildrenRecursively) {
        super.include(context, includeChildrenRecursively);
        this.openingFragment.include(context, includeChildrenRecursively);
        this.closingFragment.include(context, includeChildrenRecursively);
    }
    render(code, options) {
        switch (this.jsxMode.mode) {
            case 'classic': {
                this.renderClassicMode(code, options);
                break;
            }
            case 'automatic': {
                this.renderAutomaticMode(code, options);
                break;
            }
            default: {
                super.render(code, options);
            }
        }
    }
    renderClassicMode(code, options) {
        const { snippets: { getPropertyAccess }, useOriginalName } = options;
        const { closingFragment, factory, factoryVariable, openingFragment, start } = this;
        const [, ...nestedName] = factory.split('.');
        openingFragment.render(code, options);
        code.prependRight(start, `/*#__PURE__*/${[
            factoryVariable.getName(getPropertyAccess, useOriginalName),
            ...nestedName
        ].join('.')}(`);
        code.appendLeft(openingFragment.end, ', null');
        this.renderChildren(code, options, openingFragment.end);
        closingFragment.render(code, options);
    }
    renderAutomaticMode(code, options) {
        const { snippets: { getPropertyAccess }, useOriginalName } = options;
        const { closingFragment, factoryVariable, openingFragment, start } = this;
        openingFragment.render(code, options);
        code.prependRight(start, `/*#__PURE__*/${factoryVariable.getName(getPropertyAccess, useOriginalName)}(`);
        const { firstChild, hasMultipleChildren, childrenEnd } = this.renderChildren(code, options, openingFragment.end);
        if (firstChild) {
            code.prependRight(firstChild.start, `{ children: ${hasMultipleChildren ? '[' : ''}`);
            if (hasMultipleChildren) {
                code.appendLeft(closingFragment.start, ']');
            }
            code.appendLeft(childrenEnd, ' }');
        }
        else {
            code.appendLeft(openingFragment.end, ', {}');
        }
        closingFragment.render(code, options);
    }
}
