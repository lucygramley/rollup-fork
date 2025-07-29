export function isValidUrl(url) {
    try {
        new URL(url);
    }
    catch {
        return false;
    }
    return true;
}
export function getRollupUrl(snippet) {
    return `https://rollupjs.org/${snippet}`;
}
export function addTrailingSlashIfMissed(url) {
    if (!url.endsWith('/')) {
        return url + '/';
    }
    return url;
}
