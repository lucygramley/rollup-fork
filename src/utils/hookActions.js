import process from 'node:process';
function formatAction([pluginName, hookName, parameters]) {
    const action = `(${pluginName}) ${hookName}`;
    const s = JSON.stringify;
    switch (hookName) {
        case 'resolveId': {
            return `${action} ${s(parameters[0])} ${s(parameters[1])}`;
        }
        case 'load': {
            return `${action} ${s(parameters[0])}`;
        }
        case 'transform': {
            return `${action} ${s(parameters[1])}`;
        }
        case 'shouldTransformCachedModule': {
            return `${action} ${s(parameters[0].id)}`;
        }
        case 'moduleParsed': {
            return `${action} ${s(parameters[0].id)}`;
        }
    }
    return action;
}
let handleBeforeExit = null;
const rejectByPluginDriver = new Map();
export async function catchUnfinishedHookActions(pluginDriver, callback) {
    const emptyEventLoopPromise = new Promise((_, reject) => {
        rejectByPluginDriver.set(pluginDriver, reject);
        if (!handleBeforeExit) {
            // We only ever create a single event listener to avoid max listener and
            // other issues
            handleBeforeExit = () => {
                for (const [pluginDriver, reject] of rejectByPluginDriver) {
                    const unfulfilledActions = pluginDriver.getUnfulfilledHookActions();
                    reject(new Error(`Unexpected early exit. This happens when Promises returned by plugins cannot resolve. Unfinished hook action(s) on exit:\n` +
                        [...unfulfilledActions].map(formatAction).join('\n')));
                }
            };
            process.once('beforeExit', handleBeforeExit);
        }
    });
    try {
        return await Promise.race([callback(), emptyEventLoopPromise]);
    }
    finally {
        rejectByPluginDriver.delete(pluginDriver);
        if (rejectByPluginDriver.size === 0) {
            process.off('beforeExit', handleBeforeExit);
            handleBeforeExit = null;
        }
    }
}
