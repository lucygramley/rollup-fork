import { UnknownFalsyValue, UnknownTruthyValue, UnknownValue } from '../nodes/shared/Expression';
export function tryCastLiteralValueToBoolean(literalValue) {
    if (typeof literalValue === 'symbol') {
        if (literalValue === UnknownFalsyValue) {
            return false;
        }
        if (literalValue === UnknownTruthyValue) {
            return true;
        }
        return UnknownValue;
    }
    return !!literalValue;
}
