export function getOrCreate(map, key, init) {
    const existing = map.get(key);
    if (existing !== undefined) {
        return existing;
    }
    const value = init();
    map.set(key, value);
    return value;
}
export function getNewSet() {
    return new Set();
}
export function getNewArray() {
    return [];
}
