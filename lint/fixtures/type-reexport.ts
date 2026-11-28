// 有意违规夹具：类型别名换名再导出（非 index 文件，应报错，共 6 条）。
// 由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
import type { RetryOptions } from './source';
export type RO = RetryOptions;
// 括号不改类型，仍算转发
export type RP = (RetryOptions);
export type RQ = ((RetryOptions));
export type RR = (((RetryOptions)));
// 先声明再后置 export type 的换名（含 as 换名）
type Split = RetryOptions;
export type { Split };
type Split2 = RetryOptions;
export type { Split2 as SP2 };
