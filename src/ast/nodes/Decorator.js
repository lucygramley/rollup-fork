import { NODE_INTERACTION_UNKNOWN_CALL } from '../NodeInteractions';
import { EMPTY_PATH } from '../utils/PathTracker';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class Decorator extends NodeBase {
    hasEffects(context) {
        return (this.expression.hasEffects(context) ||
            this.expression.hasEffectsOnInteractionAtPath(EMPTY_PATH, NODE_INTERACTION_UNKNOWN_CALL, context));
    }
}
Decorator.prototype.includeNode = onlyIncludeSelf;
