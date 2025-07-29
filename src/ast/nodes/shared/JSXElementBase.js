import { getRenderedJsxChildren } from '../../../utils/jsx';
import JSXEmptyExpression from '../JSXEmptyExpression';
import JSXExpressionContainer from '../JSXExpressionContainer';
import { getAndIncludeFactoryVariable } from './jsxHelpers';
import { doNotDeoptimize, NodeBase } from './Node';
export default class JSXElementBase extends NodeBase {
    constructor() {
        super(...arguments);
        this.factoryVariable = null;
        this.factory = null;
    }
    initialise() {
        super.initialise();
        const { importSource } = (this.jsxMode = this.getRenderingMode());
        if (importSource) {
            this.scope.context.addImportSource(importSource);
        }
    }
    include(context, includeChildrenRecursively) {
        if (!this.included)
            this.includeNode(context);
        for (const child of this.children) {
            child.include(context, includeChildrenRecursively);
        }
    }
    includeNode(context) {
        this.included = true;
        const { factory, importSource, mode } = this.jsxMode;
        if (factory) {
            this.factory = factory;
            this.factoryVariable = getAndIncludeFactoryVariable(factory, mode === 'preserve', importSource, this, context);
        }
    }
    getRenderingMode() {
        const jsx = this.scope.context.options.jsx;
        const { mode, factory, importSource } = jsx;
        if (mode === 'automatic') {
            return {
                factory: getRenderedJsxChildren(this.children) > 1 ? 'jsxs' : 'jsx',
                importSource: jsx.jsxImportSource,
                mode
            };
        }
        return { factory, importSource, mode };
    }
    renderChildren(code, options, openingEnd) {
        const { children } = this;
        let hasMultipleChildren = false;
        let childrenEnd = openingEnd;
        let firstChild = null;
        for (const child of children) {
            if (child instanceof JSXExpressionContainer &&
                child.expression instanceof JSXEmptyExpression) {
                code.remove(childrenEnd, child.end);
            }
            else {
                code.appendLeft(childrenEnd, ', ');
                child.render(code, options);
                if (firstChild) {
                    hasMultipleChildren = true;
                }
                else {
                    firstChild = child;
                }
            }
            childrenEnd = child.end;
        }
        return { childrenEnd, firstChild, hasMultipleChildren };
    }
}
JSXElementBase.prototype.applyDeoptimizations = doNotDeoptimize;
