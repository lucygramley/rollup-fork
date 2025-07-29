import { UNKNOWN_EXPRESSION } from './nodes/shared/Expression';
export const INTERACTION_ACCESSED = 0;
export const INTERACTION_ASSIGNED = 1;
export const INTERACTION_CALLED = 2;
export const NODE_INTERACTION_UNKNOWN_ACCESS = {
    args: [null],
    type: INTERACTION_ACCESSED
};
export const NODE_INTERACTION_UNKNOWN_ASSIGNMENT = {
    args: [null, UNKNOWN_EXPRESSION],
    type: INTERACTION_ASSIGNED
};
// While this is technically a call without arguments, we can compare against
// this reference in places where precise values or this argument would make a
// difference
export const NODE_INTERACTION_UNKNOWN_CALL = {
    args: [null],
    type: INTERACTION_CALLED,
    withNew: false
};
