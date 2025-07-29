import { EMPTY_PATH, SHARED_RECURSION_TRACKER } from '../../utils/PathTracker';
import { IS_SKIPPED_CHAIN } from './Node';
export function getChainElementLiteralValueAtPath(element, object, path, recursionTracker, origin) {
    if ('getLiteralValueAtPathAsChainElement' in object) {
        const calleeValue = object.getLiteralValueAtPathAsChainElement(EMPTY_PATH, SHARED_RECURSION_TRACKER, origin);
        if (calleeValue === IS_SKIPPED_CHAIN || (element.optional && calleeValue == null)) {
            return IS_SKIPPED_CHAIN;
        }
    }
    else if (element.optional &&
        object.getLiteralValueAtPath(EMPTY_PATH, SHARED_RECURSION_TRACKER, origin) == null) {
        return IS_SKIPPED_CHAIN;
    }
    return element.getLiteralValueAtPath(path, recursionTracker, origin);
}
