import { parse, parseAsync } from '../../native';
import { convertProgram } from './bufferToAst';
import { getAstBuffer } from './getAstBuffer';
export const parseAst = (input, { allowReturnOutsideFunction = false, jsx = false } = {}) => convertProgram(getAstBuffer(parse(input, allowReturnOutsideFunction, jsx)));
export const parseAstAsync = async (input, { allowReturnOutsideFunction = false, jsx = false, signal } = {}) => convertProgram(getAstBuffer(await parseAsync(input, allowReturnOutsideFunction, jsx, signal)));
