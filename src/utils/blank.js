export const BLANK = Object.freeze(Object.create(null));
export const EMPTY_OBJECT = Object.freeze({});
export const EMPTY_ARRAY = Object.freeze([]);
export const EMPTY_SET = Object.freeze(new (class extends Set {
    add() {
        throw new Error('Cannot add to empty set');
    }
})());
