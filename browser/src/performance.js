const global = typeof globalThis === 'undefined' ? (typeof window === 'undefined' ? {} : window) : globalThis;
export default 'performance' in global
    ? performance
    : {
        now() {
            return 0;
        }
    };
