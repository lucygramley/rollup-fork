import { doNothing } from './doNothing';
import { LOGLEVEL_WARN, logLevelPriority } from './logging';
import { logInvalidLogPosition } from './logs';
import { normalizeLog } from './options/options';
export function getLogHandler(level, code, logger, pluginName, logLevel) {
    if (logLevelPriority[level] < logLevelPriority[logLevel]) {
        return doNothing;
    }
    return (log, pos) => {
        if (pos != null) {
            logger(LOGLEVEL_WARN, logInvalidLogPosition(pluginName));
        }
        log = normalizeLog(log);
        if (log.code && !log.pluginCode) {
            log.pluginCode = log.code;
        }
        log.code = code;
        log.plugin = pluginName;
        logger(level, log);
    };
}
