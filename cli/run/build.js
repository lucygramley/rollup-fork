var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import process from 'node:process';
import ms from 'pretty-ms';
import { rollup } from '../../src/node-entry';
import { bold, cyan, green } from '../../src/utils/colors';
import { logOnlyInlineSourcemapsForStdout } from '../../src/utils/logs';
import relativeId from '../../src/utils/relativeId';
import { handleError, stderr } from '../logging';
import { printTimings } from './timings';
export default async function build(inputOptions, warnings, silent = false) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const outputOptions = inputOptions.output;
        const useStdout = !outputOptions[0].file && !outputOptions[0].dir;
        const start = Date.now();
        const files = useStdout ? ['stdout'] : outputOptions.map(t => relativeId(t.file || t.dir));
        if (!silent) {
            let inputFiles;
            if (typeof inputOptions.input === 'string') {
                inputFiles = inputOptions.input;
            }
            else if (Array.isArray(inputOptions.input)) {
                inputFiles = inputOptions.input.join(', ');
            }
            else if (typeof inputOptions.input === 'object' && inputOptions.input !== null) {
                inputFiles = Object.values(inputOptions.input).join(', ');
            }
            stderr(cyan(`\n${bold(inputFiles)} → ${bold(files.join(', '))}...`));
        }
        const bundle = __addDisposableResource(env_1, await rollup(inputOptions), true);
        if (useStdout) {
            const output = outputOptions[0];
            if (output.sourcemap && output.sourcemap !== 'inline') {
                handleError(logOnlyInlineSourcemapsForStdout());
            }
            const { output: outputs } = await bundle.generate(output);
            for (const file of outputs) {
                if (outputs.length > 1)
                    process.stdout.write(`\n${cyan(bold(`//→ ${file.fileName}:`))}\n`);
                process.stdout.write(file.type === 'asset' ? file.source : file.code);
            }
            if (!silent) {
                warnings.flush();
            }
            return;
        }
        await Promise.all(outputOptions.map(bundle.write));
        if (!silent) {
            warnings.flush();
            stderr(green(`created ${bold(files.join(', '))} in ${bold(ms(Date.now() - start))}`));
            if (bundle && bundle.getTimings) {
                printTimings(bundle.getTimings());
            }
        }
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_1);
        if (result_1)
            await result_1;
    }
}
