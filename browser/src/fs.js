import { throwNoFileSystem } from './error';
// Ensure this satisfies the RollupFsModule API, will be removed by tree-shaking
const _typeTest = null;
export const appendFile = throwNoFileSystem('fs.appendFile');
export const copyFile = throwNoFileSystem('fs.copyFile');
export const mkdir = throwNoFileSystem('fs.mkdir');
export const mkdtemp = throwNoFileSystem('fs.mkdtemp');
export const readdir = throwNoFileSystem('fs.readdir');
export const readFile = throwNoFileSystem('fs.readFile');
export const realpath = throwNoFileSystem('fs.realpath');
export const rename = throwNoFileSystem('fs.rename');
export const rmdir = throwNoFileSystem('fs.rmdir');
export const stat = throwNoFileSystem('fs.stat');
export const lstat = throwNoFileSystem('fs.lstat');
export const unlink = throwNoFileSystem('fs.unlink');
export const writeFile = throwNoFileSystem('fs.writeFile');
