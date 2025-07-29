import { EMPTY_PATH } from '../utils/PathTracker';
import IdentifierBase from './shared/IdentifierBase';
export default class JSXIdentifier extends IdentifierBase {
    constructor() {
        super(...arguments);
        this.isNativeElement = false;
    }
    bind() {
        const type = this.getType();
        if (type === 0 /* IdentifierType.Reference */) {
            this.variable = this.scope.findVariable(this.name);
            this.variable.addReference(this);
        }
        else if (type === 1 /* IdentifierType.NativeElementName */) {
            this.isNativeElement = true;
        }
    }
    include(context) {
        if (!this.included)
            this.includeNode(context);
    }
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        if (this.variable !== null) {
            this.scope.context.includeVariableInModule(this.variable, EMPTY_PATH, context);
        }
    }
    includePath(path, context) {
        if (!this.included) {
            this.included = true;
            if (this.variable !== null) {
                this.scope.context.includeVariableInModule(this.variable, path, context);
            }
        }
        else if (path.length > 0) {
            this.variable?.includePath(path, context);
        }
    }
    render(code, { snippets: { getPropertyAccess }, useOriginalName }) {
        if (this.variable) {
            const name = this.variable.getName(getPropertyAccess, useOriginalName);
            if (name !== this.name) {
                code.overwrite(this.start, this.end, name, {
                    contentOnly: true,
                    storeName: true
                });
            }
        }
        else if (this.isNativeElement &&
            this.scope.context.options.jsx.mode !== 'preserve') {
            code.update(this.start, this.end, JSON.stringify(this.name));
        }
    }
    getType() {
        switch (this.parent.type) {
            case 'JSXOpeningElement':
            case 'JSXClosingElement': {
                return this.name.startsWith(this.name.charAt(0).toUpperCase())
                    ? 0 /* IdentifierType.Reference */
                    : 1 /* IdentifierType.NativeElementName */;
            }
            case 'JSXMemberExpression': {
                return this.parent.object === this
                    ? 0 /* IdentifierType.Reference */
                    : 2 /* IdentifierType.Other */;
            }
            case 'JSXAttribute':
            case 'JSXNamespacedName': {
                return 2 /* IdentifierType.Other */;
            }
            default: {
                /* istanbul ignore next */
                throw new Error(`Unexpected parent node type for JSXIdentifier: ${this.parent.type}`);
            }
        }
    }
}
