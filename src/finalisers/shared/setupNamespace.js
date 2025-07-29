import { LOGLEVEL_WARN } from '../../utils/logging';
import { logReservedNamespace } from '../../utils/logs';
export default function setupNamespace(name, root, globals, { _, getPropertyAccess, s }, compact, log) {
    const parts = name.split('.');
    // Check if the key exists in the object's prototype.
    const isReserved = parts[0] in Object.prototype;
    if (log && isReserved) {
        log(LOGLEVEL_WARN, logReservedNamespace(parts[0]));
    }
    parts[0] =
        (typeof globals === 'function'
            ? globals(parts[0])
            : isReserved
                ? parts[0]
                : globals[parts[0]]) || parts[0];
    parts.pop();
    let propertyPath = root;
    return (parts
        .map(part => {
        propertyPath += getPropertyAccess(part);
        return `${propertyPath}${_}=${_}${propertyPath}${_}||${_}{}${s}`;
    })
        .join(compact ? ',' : '\n') + (compact && parts.length > 0 ? ';' : '\n'));
}
export function assignToDeepVariable(deepName, root, globals, assignment, { _, getPropertyAccess }, log) {
    const parts = deepName.split('.');
    // Check if the key exists in the object's prototype.
    const isReserved = parts[0] in Object.prototype;
    if (log && isReserved) {
        log(LOGLEVEL_WARN, logReservedNamespace(parts[0]));
    }
    parts[0] =
        (typeof globals === 'function'
            ? globals(parts[0])
            : isReserved
                ? parts[0]
                : globals[parts[0]]) || parts[0];
    const last = parts.pop();
    let propertyPath = root;
    let deepAssignment = [
        ...parts.map(part => {
            propertyPath += getPropertyAccess(part);
            return `${propertyPath}${_}=${_}${propertyPath}${_}||${_}{}`;
        }),
        `${propertyPath}${getPropertyAccess(last)}`
    ].join(`,${_}`) + `${_}=${_}${assignment}`;
    if (parts.length > 0) {
        deepAssignment = `(${deepAssignment})`;
    }
    return deepAssignment;
}
