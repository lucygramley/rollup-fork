import { DiscriminatedPathTracker, EntityPathTracker } from './utils/PathTracker';
export function createInclusionContext() {
    return {
        brokenFlow: false,
        hasBreak: false,
        hasContinue: false,
        includedCallArguments: new Set(),
        includedLabels: new Set()
    };
}
export function createHasEffectsContext() {
    return {
        accessed: new EntityPathTracker(),
        assigned: new EntityPathTracker(),
        brokenFlow: false,
        called: new DiscriminatedPathTracker(),
        hasBreak: false,
        hasContinue: false,
        ignore: {
            breaks: false,
            continues: false,
            labels: new Set(),
            returnYield: false,
            this: false
        },
        includedLabels: new Set(),
        instantiated: new DiscriminatedPathTracker(),
        replacedVariableInits: new Map()
    };
}
