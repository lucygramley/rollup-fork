import { checkEffectForNodes } from '../utils/checkEffectForNodes';
import MethodBase from './shared/MethodBase';
export default class MethodDefinition extends MethodBase {
    hasEffects(context) {
        return super.hasEffects(context) || checkEffectForNodes(this.decorators, context);
    }
}
