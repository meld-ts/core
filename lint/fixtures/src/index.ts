// 入口纪律夹具（round06 F-01）：src/ 下的 index.ts 顶层只允许星号转发。
// import 与星号三形态豁免；其余顶层语句（含五类转发形态的语句、本地声明 /
// 实现、未导出的本地别名、组合类型别名、导出本地绑定）统一由入口分支报，
// 每条一条，合计 13 条。由 lint/no-cross-file-reexport.test.ts 断言诊断数，
// 不要「修复」本文件。
import { isNumber, isString } from '../source';
import type { RetryOptions, Wrapper } from '../source';
export * from '../source';
export * as ns from '../source';
export type * from '../source';
export { isString } from '../source';
export type { RetryOptions } from '../source';
export const N = isNumber;
export type RO = RetryOptions;
export default (isNumber);
export interface Extra { a: string }
export type LocalAlias = { b: number };
export const helper = () => 1;
const local = 1;
export { local };
const hidden = isString;
export type Spec = Wrapper<string>;
export type Composed = Omit<Wrapper<string>, 'value'>;
