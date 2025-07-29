import { createHasEffectsContext } from '../ExecutionContext';
import { UnknownKey } from '../utils/PathTracker';
import Identifier from './Identifier';
import { isFlagSet, setFlag } from './shared/BitFlags';
import MethodBase from './shared/MethodBase';
import { doNotDeoptimize, onlyIncludeSelfNoDeoptimize } from './shared/Node';
export default class Property extends MethodBase {
    //declare method: boolean;
    get method() {
        return isFlagSet(this.flags, 262144 /* Flag.method */);
    }
    set method(value) {
        this.flags = setFlag(this.flags, 262144 /* Flag.method */, value);
    }
    //declare shorthand: boolean;
    get shorthand() {
        return isFlagSet(this.flags, 524288 /* Flag.shorthand */);
    }
    set shorthand(value) {
        this.flags = setFlag(this.flags, 524288 /* Flag.shorthand */, value);
    }
    declare(kind, destructuredInitPath, init) {
        return this.value.declare(kind, this.getPathInProperty(destructuredInitPath), init);
    }
    deoptimizeAssignment(destructuredInitPath, init) {
        this.value.deoptimizeAssignment?.(this.getPathInProperty(destructuredInitPath), init);
    }
    hasEffects(context) {
        return this.key.hasEffects(context) || this.value.hasEffects(context);
    }
    hasEffectsWhenDestructuring(context, destructuredInitPath, init) {
        return this.value.hasEffectsWhenDestructuring?.(context, this.getPathInProperty(destructuredInitPath), init);
    }
    includeDestructuredIfNecessary(context, destructuredInitPath, init) {
        const path = this.getPathInProperty(destructuredInitPath);
        let included = this.value.includeDestructuredIfNecessary(context, path, init) ||
            this.included;
        if ((included ||= this.key.hasEffects(createHasEffectsContext()))) {
            this.key.include(context, false);
            if (!this.value.included) {
                this.value.included = true;
                // Unfortunately, we need to include the value again now, so that any
                // declared variables are properly included.
                this.value.includeDestructuredIfNecessary(context, path, init);
            }
        }
        return (this.included = included);
    }
    include(context, includeChildrenRecursively) {
        this.included = true;
        this.key.include(context, includeChildrenRecursively);
        this.value.include(context, includeChildrenRecursively);
    }
    includePath(path, context) {
        this.included = true;
        this.value.includePath(path, context);
    }
    markDeclarationReached() {
        this.value.markDeclarationReached();
    }
    render(code, options) {
        if (!this.shorthand) {
            this.key.render(code, options);
        }
        this.value.render(code, options, { isShorthandProperty: this.shorthand });
    }
    getPathInProperty(destructuredInitPath) {
        return destructuredInitPath.at(-1) === UnknownKey
            ? destructuredInitPath
            : // For now, we only consider static paths as we do not know how to
                // deoptimize the path in the dynamic case.
                this.computed
                    ? [...destructuredInitPath, UnknownKey]
                    : this.key instanceof Identifier
                        ? [...destructuredInitPath, this.key.name]
                        : [...destructuredInitPath, String(this.key.value)];
    }
}
Property.prototype.includeNode = onlyIncludeSelfNoDeoptimize;
Property.prototype.applyDeoptimizations = doNotDeoptimize;
