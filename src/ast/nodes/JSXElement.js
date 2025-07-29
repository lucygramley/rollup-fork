import JSXAttribute from './JSXAttribute';
import JSXSpreadAttribute from './JSXSpreadAttribute';
import JSXElementBase from './shared/JSXElementBase';
export default class JSXElement extends JSXElementBase {
    include(context, includeChildrenRecursively) {
        super.include(context, includeChildrenRecursively);
        this.openingElement.include(context, includeChildrenRecursively);
        this.closingElement?.include(context, includeChildrenRecursively);
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
    getRenderingMode() {
        const jsx = this.scope.context.options.jsx;
        const { mode, factory, importSource } = jsx;
        if (mode === 'automatic') {
            // In the case there is a key after a spread attribute, we fall back to
            // classic mode, see https://github.com/facebook/react/issues/20031#issuecomment-710346866
            // for reasoning.
            let hasSpread = false;
            for (const attribute of this.openingElement.attributes) {
                if (attribute instanceof JSXSpreadAttribute) {
                    hasSpread = true;
                }
                else if (hasSpread && attribute.name.name === 'key') {
                    return { factory, importSource, mode: 'classic' };
                }
            }
        }
        return super.getRenderingMode();
    }
    renderClassicMode(code, options) {
        const { snippets: { getPropertyAccess }, useOriginalName } = options;
        const { closingElement, end, factory, factoryVariable, openingElement: { end: openingEnd, selfClosing } } = this;
        const [, ...nestedName] = factory.split('.');
        const { firstAttribute, hasAttributes, hasSpread, inObject, previousEnd } = this.renderAttributes(code, options, [factoryVariable.getName(getPropertyAccess, useOriginalName), ...nestedName].join('.'), false);
        this.wrapAttributes(code, inObject, hasAttributes, hasSpread, firstAttribute, 'null', previousEnd);
        this.renderChildren(code, options, openingEnd);
        if (selfClosing) {
            code.appendLeft(end, ')');
        }
        else {
            closingElement.render(code, options);
        }
    }
    renderAutomaticMode(code, options) {
        const { snippets: { getPropertyAccess }, useOriginalName } = options;
        const { closingElement, end, factoryVariable, openingElement: { end: openindEnd, selfClosing } } = this;
        let { firstAttribute, hasAttributes, hasSpread, inObject, keyAttribute, previousEnd } = this.renderAttributes(code, options, factoryVariable.getName(getPropertyAccess, useOriginalName), true);
        const { firstChild, hasMultipleChildren, childrenEnd } = this.renderChildren(code, options, openindEnd);
        if (firstChild) {
            code.prependRight(firstChild.start, `children: ${hasMultipleChildren ? '[' : ''}`);
            if (!inObject) {
                code.prependRight(firstChild.start, '{ ');
                inObject = true;
            }
            previousEnd = closingElement.start;
            if (hasMultipleChildren) {
                code.appendLeft(previousEnd, ']');
            }
        }
        this.wrapAttributes(code, inObject, hasAttributes || !!firstChild, hasSpread, firstAttribute || firstChild, '{}', childrenEnd);
        if (keyAttribute) {
            const { value } = keyAttribute;
            // This will appear to the left of the moved code...
            code.appendLeft(childrenEnd, ', ');
            if (value) {
                code.move(value.start, value.end, childrenEnd);
            }
            else {
                code.appendLeft(childrenEnd, 'true');
            }
        }
        if (selfClosing) {
            // Moving the key attribute will also move the parenthesis to the right position
            code.appendLeft(keyAttribute?.value?.end || end, ')');
        }
        else {
            closingElement.render(code, options);
        }
    }
    renderAttributes(code, options, factoryName, extractKeyAttribute) {
        const { jsxMode: { mode }, openingElement } = this;
        const { attributes, end: openingEnd, start: openingStart, name: { start: nameStart, end: nameEnd } } = openingElement;
        code.update(openingStart, nameStart, `/*#__PURE__*/${factoryName}(`);
        openingElement.render(code, options, { jsxMode: mode });
        let keyAttribute = null;
        let hasSpread = false;
        let inObject = false;
        let previousEnd = nameEnd;
        let hasAttributes = false;
        let firstAttribute = null;
        for (const attribute of attributes) {
            if (attribute instanceof JSXAttribute) {
                if (extractKeyAttribute && attribute.name.name === 'key') {
                    keyAttribute = attribute;
                    code.remove(previousEnd, attribute.value?.start || attribute.end);
                    continue;
                }
                code.appendLeft(previousEnd, ',');
                if (!inObject) {
                    code.prependRight(attribute.start, '{ ');
                    inObject = true;
                }
                hasAttributes = true;
            }
            else {
                if (inObject) {
                    if (hasAttributes) {
                        code.appendLeft(previousEnd, ' ');
                    }
                    code.appendLeft(previousEnd, '},');
                    inObject = false;
                }
                else {
                    code.appendLeft(previousEnd, ',');
                }
                hasSpread = true;
            }
            previousEnd = attribute.end;
            if (!firstAttribute) {
                firstAttribute = attribute;
            }
        }
        code.remove(attributes.at(-1)?.end || previousEnd, openingEnd);
        return { firstAttribute, hasAttributes, hasSpread, inObject, keyAttribute, previousEnd };
    }
    wrapAttributes(code, inObject, hasAttributes, hasSpread, firstAttribute, missingAttributesFallback, attributesEnd) {
        if (inObject) {
            code.appendLeft(attributesEnd, ' }');
        }
        if (hasSpread) {
            if (hasAttributes) {
                const { start } = firstAttribute;
                if (firstAttribute instanceof JSXSpreadAttribute) {
                    code.prependRight(start, '{}, ');
                }
                code.prependRight(start, 'Object.assign(');
                code.appendLeft(attributesEnd, ')');
            }
        }
        else if (!hasAttributes) {
            code.appendLeft(attributesEnd, `, ${missingAttributesFallback}`);
        }
    }
}
