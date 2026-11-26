// 入口行为夹具（非 src/ 路径）：index.ts 里星号转发豁免（0 条），五类转发形态
// 一律报错——逐个列举（export { a } from / export type { a } from，2 条）、
// 换名再导出与类型别名（2 条）、export default 转发（1 条），共 5 条。src/ 路径
// 下入口纪律（本地类型 / 实现 / 绑定）见 lint/fixtures/src/。由
// lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
import { isNumber } from '../source';
import type { RetryOptions } from '../source';
export * from '../source';
export * as ns from '../source';
export type * from '../source';
export { isString } from '../source';
export type { RetryOptions } from '../source';
export const N = isNumber;
export type RO = RetryOptions;
export default (isNumber);
