import { basename, dirname, isAbsolute, resolve } from './path';
import { resolveIdViaPlugins } from './resolveIdViaPlugins';
export async function resolveId(source, importer, preserveSymlinks, pluginDriver, moduleLoaderResolveId, skip, customOptions, isEntry, attributes, fs) {
    const pluginResult = await resolveIdViaPlugins(source, importer, pluginDriver, moduleLoaderResolveId, skip, customOptions, isEntry, attributes);
    if (pluginResult != null) {
        const [resolveIdResult, plugin] = pluginResult;
        if (typeof resolveIdResult === 'object' && !resolveIdResult.resolvedBy) {
            return {
                ...resolveIdResult,
                resolvedBy: plugin.name
            };
        }
        if (typeof resolveIdResult === 'string') {
            return {
                id: resolveIdResult,
                resolvedBy: plugin.name
            };
        }
        return resolveIdResult;
    }
    // external modules (non-entry modules that start with neither '.' or '/')
    // are skipped at this stage.
    if (importer !== undefined && !isAbsolute(source) && source[0] !== '.')
        return null;
    // `resolve` processes paths from right to left, prepending them until an
    // absolute path is created. Absolute importees therefore shortcircuit the
    // resolve call and require no special handing on our part.
    // See https://nodejs.org/api/path.html#path_path_resolve_paths
    return addJsExtensionIfNecessary(importer ? resolve(dirname(importer), source) : resolve(source), preserveSymlinks, fs);
}
async function addJsExtensionIfNecessary(file, preserveSymlinks, fs) {
    return ((await findFile(file, preserveSymlinks, fs)) ??
        (await findFile(file + '.mjs', preserveSymlinks, fs)) ??
        (await findFile(file + '.js', preserveSymlinks, fs)));
}
async function findFile(file, preserveSymlinks, fs) {
    try {
        const stats = await fs.lstat(file);
        if (!preserveSymlinks && stats.isSymbolicLink())
            return await findFile(await fs.realpath(file), preserveSymlinks, fs);
        if ((preserveSymlinks && stats.isSymbolicLink()) || stats.isFile()) {
            // check case
            const name = basename(file);
            const files = await fs.readdir(dirname(file));
            if (files.includes(name))
                return file;
        }
    }
    catch {
        // suppress
    }
}
