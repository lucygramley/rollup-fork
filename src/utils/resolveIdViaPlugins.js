import { BLANK, EMPTY_OBJECT } from './blank';
export function resolveIdViaPlugins(source, importer, pluginDriver, moduleLoaderResolveId, skip, customOptions, isEntry, attributes) {
    let skipped = null;
    let replaceContext = null;
    if (skip) {
        skipped = new Set();
        for (const skippedCall of skip) {
            if (source === skippedCall.source && importer === skippedCall.importer) {
                skipped.add(skippedCall.plugin);
            }
        }
        replaceContext = (pluginContext, plugin) => ({
            ...pluginContext,
            resolve: (source, importer, { attributes, custom, isEntry, skipSelf } = BLANK) => {
                skipSelf ??= true;
                if (skipSelf &&
                    skip.findIndex(skippedCall => {
                        return (skippedCall.plugin === plugin &&
                            skippedCall.source === source &&
                            skippedCall.importer === importer);
                    }) !== -1) {
                    // This means that the plugin recursively called itself
                    // Thus returning Promise.resolve(null) in purpose of fallback to default behavior of `resolveId` plugin hook.
                    return Promise.resolve(null);
                }
                return moduleLoaderResolveId(source, importer, custom, isEntry, attributes || EMPTY_OBJECT, skipSelf ? [...skip, { importer, plugin, source }] : skip);
            }
        });
    }
    return pluginDriver.hookFirstAndGetPlugin('resolveId', [source, importer, { attributes, custom: customOptions, isEntry }], replaceContext, skipped);
}
