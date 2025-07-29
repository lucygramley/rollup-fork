import { ExpressionEntity } from './Expression';
export class ObjectMember extends ExpressionEntity {
    constructor(object, path) {
        super();
        this.object = object;
        this.path = path;
    }
    deoptimizeArgumentsOnInteractionAtPath(interaction, path, recursionTracker) {
        this.object.deoptimizeArgumentsOnInteractionAtPath(interaction, [...this.path, ...path], recursionTracker);
    }
    deoptimizePath(path) {
        this.object.deoptimizePath([...this.path, ...path]);
    }
    getLiteralValueAtPath(path, recursionTracker, origin) {
        return this.object.getLiteralValueAtPath([...this.path, ...path], recursionTracker, origin);
    }
    getReturnExpressionWhenCalledAtPath(path, interaction, recursionTracker, origin) {
        return this.object.getReturnExpressionWhenCalledAtPath([...this.path, ...path], interaction, recursionTracker, origin);
    }
    hasEffectsOnInteractionAtPath(path, interaction, context) {
        return this.object.hasEffectsOnInteractionAtPath([...this.path, ...path], interaction, context);
    }
}
