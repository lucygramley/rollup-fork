import { BLANK } from '../../utils/blank';
import { stringifyObjectKeyIfNeeded } from '../../utils/identifierHelpers';
import JSXIdentifier from './JSXIdentifier';
import { NodeBase, onlyIncludeSelf } from './shared/Node';
export default class JSXAttribute extends NodeBase {
    render(code, options, { jsxMode } = BLANK) {
        super.render(code, options);
        if (['classic', 'automatic'].includes(jsxMode)) {
            const { name, value } = this;
            const key = name instanceof JSXIdentifier ? name.name : `${name.namespace.name}:${name.name.name}`;
            if (!(jsxMode === 'automatic' && key === 'key')) {
                const safeKey = stringifyObjectKeyIfNeeded(key);
                if (key !== safeKey) {
                    code.overwrite(name.start, name.end, safeKey, { contentOnly: true });
                }
                if (value) {
                    code.overwrite(name.end, value.start, ': ', { contentOnly: true });
                }
                else {
                    code.appendLeft(name.end, ': true');
                }
            }
        }
    }
}
JSXAttribute.prototype.includeNode = onlyIncludeSelf;
