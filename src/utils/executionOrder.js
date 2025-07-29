import Module from '../Module';
const compareExecIndex = (unitA, unitB) => unitA.execIndex > unitB.execIndex ? 1 : -1;
export function sortByExecutionOrder(units) {
    units.sort(compareExecIndex);
}
// This process is currently faulty in so far as it only takes the first entry
// module into account and assumes that dynamic imports are imported in a
// certain order.
// A better algorithm would follow every possible execution path and mark which
// modules are executed before or after which other modules. THen the chunking
// would need to take care that in each chunk, all modules are always executed
// in the same sequence.
export function analyseModuleExecution(entryModules) {
    let nextExecIndex = 0;
    const cyclePaths = [];
    const analysedModules = new Set();
    const dynamicImports = new Set();
    const parents = new Map();
    const orderedModules = [];
    const handleSyncLoadedModule = (module, parent) => {
        if (parents.has(module)) {
            if (!analysedModules.has(module)) {
                cyclePaths.push(getCyclePath(module, parent, parents));
            }
            return;
        }
        parents.set(module, parent);
        analyseModule(module);
    };
    const analyseModule = (module) => {
        if (module instanceof Module) {
            for (const dependency of module.dependencies) {
                handleSyncLoadedModule(dependency, module);
            }
            for (const dependency of module.implicitlyLoadedBefore) {
                dynamicImports.add(dependency);
            }
            for (const { resolution, node } of module.dynamicImports) {
                if (resolution instanceof Module) {
                    if (node.withinTopLevelAwait) {
                        handleSyncLoadedModule(resolution, module);
                    }
                    else {
                        dynamicImports.add(resolution);
                    }
                }
            }
            orderedModules.push(module);
        }
        module.execIndex = nextExecIndex++;
        analysedModules.add(module);
    };
    for (const currentEntry of entryModules) {
        if (!parents.has(currentEntry)) {
            parents.set(currentEntry, null);
            analyseModule(currentEntry);
        }
    }
    for (const currentEntry of dynamicImports) {
        if (!parents.has(currentEntry)) {
            parents.set(currentEntry, null);
            analyseModule(currentEntry);
        }
    }
    return { cyclePaths, orderedModules };
}
function getCyclePath(module, parent, parents) {
    const cycleSymbol = Symbol(module.id);
    const path = [module.id];
    let nextModule = parent;
    module.cycles.add(cycleSymbol);
    while (nextModule !== module) {
        nextModule.cycles.add(cycleSymbol);
        path.push(nextModule.id);
        nextModule = parents.get(nextModule);
    }
    path.push(path[0]);
    path.reverse();
    return path;
}
