import { error, logNoFileSystemInBrowser } from '../../src/utils/logs';
export const throwNoFileSystem = (method) => () => error(logNoFileSystemInBrowser(method));
