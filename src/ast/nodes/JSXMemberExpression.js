import { NodeBase } from './shared/Node';
export default class JSXMemberExpression extends NodeBase {
    includeNode(context) {
        this.included = true;
        if (!this.deoptimized)
            this.applyDeoptimizations();
        this.object.includePath([this.property.name], context);
    }
    includePath(path, context) {
        if (!this.included)
            this.includeNode(context);
        this.object.includePath([this.property.name, ...path], context);
    }
}
