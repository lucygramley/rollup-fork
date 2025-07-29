export const LOGLEVEL_SILENT = 'silent';
export const LOGLEVEL_ERROR = 'error';
export const LOGLEVEL_WARN = 'warn';
export const LOGLEVEL_INFO = 'info';
export const LOGLEVEL_DEBUG = 'debug';
export const logLevelPriority = {
    [LOGLEVEL_DEBUG]: 0,
    [LOGLEVEL_INFO]: 1,
    [LOGLEVEL_SILENT]: 3,
    [LOGLEVEL_WARN]: 2
};
