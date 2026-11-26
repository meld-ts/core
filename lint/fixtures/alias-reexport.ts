// 有意违规夹具：换名再导出的全部值形态（非 index 文件，应逐条报错，共 23 条）。
// 由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
import { isString, isNumber } from './source';
import { isString as s } from './source';
import * as errors from './source';
import isStringDefault from './source';
export const A = isString;
export let B = isString;
export var V = isString;
export const C: typeof isString = isString;
export const D = isString as typeof isString;
export const D2 = isString as unknown as typeof isString;
export const E = isString, F = isNumber;
export const G = errors;
export const H = s;
export const I = isStringDefault;
export const J = (isString);
export const K = ((isString));
export const L = isString!;
export const M = (isString as typeof isString);
export const N = isString satisfies typeof isString;
// 三层及四层混合包装（AST 深度到四层）：((x as T)!) 是 括号→非空→括号→断言
export const O = (((isString)));
export const P = isString as unknown as any as typeof isString;
export const Q = ((isString as typeof isString)!);
export const R = isString, S = (((isString)));
// 先声明再后置 export 的换名（含 as 换名）
const T = isString;
export { T };
const U = isString;
export { U as u2 };
