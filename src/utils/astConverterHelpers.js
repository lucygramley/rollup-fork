import { EMPTY_ARRAY } from './blank';
import FIXED_STRINGS from './convert-ast-strings';
export const ANNOTATION_KEY = '_rollupAnnotations';
export const INVALID_ANNOTATION_KEY = '_rollupRemoved';
export const convertAnnotations = (position, buffer) => {
    if (position === 0)
        return EMPTY_ARRAY;
    const length = buffer[position++];
    const list = new Array(length);
    for (let index = 0; index < length; index++) {
        list[index] = convertAnnotation(buffer[position++], buffer);
    }
    return list;
};
const convertAnnotation = (position, buffer) => {
    const start = buffer[position++];
    const end = buffer[position++];
    const type = FIXED_STRINGS[buffer[position]];
    return { end, start, type };
};
