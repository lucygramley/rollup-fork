import { MISSING_EXPORT_SHIM_VARIABLE } from '../../utils/variableNames';
import Variable from './Variable';
export default class ExportShimVariable extends Variable {
    constructor(module) {
        super(MISSING_EXPORT_SHIM_VARIABLE);
        this.module = module;
    }
    includePath(path, context) {
        super.includePath(path, context);
        this.module.needsExportShim = true;
    }
}
