import JSXEmptyExpression from '../ast/nodes/JSXEmptyExpression';
import JSXExpressionContainer from '../ast/nodes/JSXExpressionContainer';
export function getRenderedJsxChildren(children) {
    let renderedChildren = 0;
    for (const child of children) {
        if (!(child instanceof JSXExpressionContainer && child.expression instanceof JSXEmptyExpression)) {
            renderedChildren++;
        }
    }
    return renderedChildren;
}
