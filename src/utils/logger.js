import { version as rollupVersion } from 'package.json';
import { getSortedValidatedPlugins } from './PluginDriver';
import { EMPTY_SET } from './blank';
import { doNothing } from './doNothing';
import { LOGLEVEL_DEBUG, LOGLEVEL_INFO, LOGLEVEL_WARN, logLevelPriority } from './logging';
import { augmentLogMessage, error } from './logs';
import { normalizeLog } from './options/options';
export function getLogger(plugins, onLog, watchMode, logLevel) {
    plugins = getSortedValidatedPlugins('onLog', plugins);
    const minimalPriority = logLevelPriority[logLevel];
    const logger = (level, log, skipped = EMPTY_SET) => {
        augmentLogMessage(log);
        const logPriority = logLevelPriority[level];
        if (logPriority < minimalPriority) {
            return;
        }
        for (const plugin of plugins) {
            if (skipped.has(plugin))
                continue;
            const { onLog: pluginOnLog } = plugin;
            const getLogHandler = (level) => {
                if (logLevelPriority[level] < minimalPriority) {
                    return doNothing;
                }
                return log => logger(level, normalizeLog(log), new Set(skipped).add(plugin));
            };
            const handler = 'handler' in pluginOnLog ? pluginOnLog.handler : pluginOnLog;
            if (handler.call({
                debug: getLogHandler(LOGLEVEL_DEBUG),
                error: (log) => error(normalizeLog(log)),
                info: getLogHandler(LOGLEVEL_INFO),
                meta: { rollupVersion, watchMode },
                warn: getLogHandler(LOGLEVEL_WARN)
            }, level, log) === false) {
                return;
            }
        }
        onLog(level, log);
    };
    return logger;
}
