import { onlyIncludeSelf, StatementBase } from './shared/Node';
export default class DebuggerStatement extends StatementBase {
    hasEffects() {
        return true;
    }
}
DebuggerStatement.prototype.includeNode = onlyIncludeSelf;
