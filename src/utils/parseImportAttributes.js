import ObjectExpression from '../ast/nodes/ObjectExpression';
import { EMPTY_OBJECT } from './blank';
import { LOGLEVEL_WARN } from './logging';
import { logImportAttributeIsInvalid, logImportOptionsAreInvalid } from './logs';
const ATTRIBUTE_KEYWORDS = new Set(['assert', 'with']);
export function getAttributesFromImportExpression(node) {
    const { scope: { context }, options, start } = node;
    if (!(options instanceof ObjectExpression)) {
        if (options) {
            context.module.log(LOGLEVEL_WARN, logImportAttributeIsInvalid(context.module.id), start);
        }
        return EMPTY_OBJECT;
    }
    const assertProperty = options.properties.find((property) => ATTRIBUTE_KEYWORDS.has(getPropertyKey(property)))?.value;
    if (!assertProperty) {
        return EMPTY_OBJECT;
    }
    if (!(assertProperty instanceof ObjectExpression)) {
        context.module.log(LOGLEVEL_WARN, logImportOptionsAreInvalid(context.module.id), start);
        return EMPTY_OBJECT;
    }
    const assertFields = assertProperty.properties
        .map(property => {
        const key = getPropertyKey(property);
        if (typeof key === 'string' &&
            typeof property.value.value === 'string') {
            return [key, property.value.value];
        }
        context.module.log(LOGLEVEL_WARN, logImportAttributeIsInvalid(context.module.id), property.start);
        return null;
    })
        .filter((property) => !!property);
    if (assertFields.length > 0) {
        return Object.fromEntries(assertFields);
    }
    return EMPTY_OBJECT;
}
const getPropertyKey = (property) => {
    const key = property.key;
    return (key &&
        !property.computed &&
        (key.name || key.value));
};
export function getAttributesFromImportExportDeclaration(attributes) {
    return attributes?.length
        ? Object.fromEntries(attributes.map(assertion => [getPropertyKey(assertion), assertion.value.value]))
        : EMPTY_OBJECT;
}
export function doAttributesDiffer(assertionA, assertionB) {
    const keysA = Object.keys(assertionA);
    return (keysA.length !== Object.keys(assertionB).length ||
        keysA.some(key => assertionA[key] !== assertionB[key]));
}
