import { UNKNOWN_EXPRESSION } from '../nodes/shared/Expression';
import { EMPTY_PATH } from '../utils/PathTracker';
import ParameterVariable from './ParameterVariable';
export default class ThisVariable extends ParameterVariable {
    constructor(context) {
        super('this', null, EMPTY_PATH, context);
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        return (context.replacedVariableInits.get(this) || UNKNOWN_EXPRESSION).hasEffectsOnInteractionAtPath(path, interaction, context);
    }
}
