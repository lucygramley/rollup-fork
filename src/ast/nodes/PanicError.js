import { error, getRollupError, logModuleParseError, logParseError } from '../../utils/logs';
import { NodeBase } from './shared/Node';
export default class PanicError extends NodeBase {
    initialise() {
        const id = this.scope.context.module.id;
        // This simulates the current nested error structure. We could also just
        // replace it with a flat error.
        const parseError = getRollupError(logParseError(this.message));
        const moduleParseError = logModuleParseError(parseError, id);
        return error(moduleParseError);
    }
}
