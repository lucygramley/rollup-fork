import { INTERACTION_CALLED } from '../NodeInteractions';
import ReturnValueScope from '../scopes/ReturnValueScope';
import { UNKNOWN_PATH } from '../utils/PathTracker';
import Identifier from './Identifier';
import * as NodeType from './NodeType';
import { isFlagSet, setFlag } from './shared/BitFlags';
import FunctionBase from './shared/FunctionBase';
import { ObjectEntity } from './shared/ObjectEntity';
import { OBJECT_PROTOTYPE } from './shared/ObjectPrototype';
export default class ArrowFunctionExpression extends FunctionBase {
    constructor() {
        super(...arguments);
        this.objectEntity = null;
    }
    get expression() {
        return isFlagSet(this.flags, 8388608 /* Flag.expression */);
    }
    set expression(value) {
        this.flags = setFlag(this.flags, 8388608 /* Flag.expression */, value);
    }
    createScope(parentScope) {
        this.scope = new ReturnValueScope(parentScope, false);
    }
    hasEffects() {
        return false;
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        if (this.annotationNoSideEffects &&
            path.length === 0 &&
            interaction.type === INTERACTION_CALLED) {
            return false;
        }
        if (super.hasEffectsOnInteractionAtPath(path, interaction, context)) {
            return true;
        }
        if (interaction.type === INTERACTION_CALLED) {
            const { ignore, brokenFlow } = context;
            context.ignore = {
                breaks: false,
                continues: false,
                labels: new Set(),
                returnYield: true,
                this: false
            };
            if (this.body.hasEffects(context))
                return true;
            context.ignore = ignore;
            context.brokenFlow = brokenFlow;
        }
        return false;
    }
    onlyFunctionCallUsed() {
        const isIIFE = this.parent.type === NodeType.CallExpression &&
            this.parent.callee === this;
        return isIIFE || super.onlyFunctionCallUsed();
    }
    include(context, includeChildrenRecursively) {
        super.include(context, includeChildrenRecursively);
        for (const parameter of this.params) {
            if (!(parameter instanceof Identifier)) {
                parameter.include(context, includeChildrenRecursively);
            }
        }
    }
    includeNode(context) {
        this.included = true;
        this.body.includePath(UNKNOWN_PATH, context);
        for (const parameter of this.params) {
            if (!(parameter instanceof Identifier)) {
                parameter.includePath(UNKNOWN_PATH, context);
            }
        }
    }
    getObjectEntity() {
        if (this.objectEntity !== null) {
            return this.objectEntity;
        }
        return (this.objectEntity = new ObjectEntity([], OBJECT_PROTOTYPE));
    }
}
