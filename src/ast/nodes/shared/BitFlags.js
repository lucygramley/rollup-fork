export function isFlagSet(flags, flag) {
    return (flags & flag) !== 0;
}
export function setFlag(flags, flag, value) {
    return (flags & ~flag) | (-value & flag);
}
