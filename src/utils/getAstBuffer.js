export function getAstBuffer(astBuffer) {
    const array = new Uint32Array(astBuffer.buffer);
    let convertString;
    if (typeof Buffer !== 'undefined' && astBuffer instanceof Buffer) {
        convertString = (position) => {
            const length = array[position++];
            const bytePosition = position << 2;
            return astBuffer.toString('utf8', bytePosition, bytePosition + length);
        };
    }
    else {
        const textDecoder = new TextDecoder();
        convertString = (position) => {
            const length = array[position++];
            const bytePosition = position << 2;
            return textDecoder.decode(astBuffer.subarray(bytePosition, bytePosition + length));
        };
    }
    return Object.assign(array, { convertString });
}
