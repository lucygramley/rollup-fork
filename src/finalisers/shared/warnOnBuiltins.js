import builtinModules from 'builtin-modules';
import { LOGLEVEL_WARN } from '../../utils/logging';
import { logMissingNodeBuiltins } from '../../utils/logs';
const nodeBuiltins = new Set(builtinModules);
export default function warnOnBuiltins(log, dependencies) {
    const externalBuiltins = dependencies
        .map(({ importPath }) => importPath)
        .filter(importPath => nodeBuiltins.has(importPath) || importPath.startsWith('node:'));
    if (externalBuiltins.length === 0)
        return;
    log(LOGLEVEL_WARN, logMissingNodeBuiltins(externalBuiltins));
}
