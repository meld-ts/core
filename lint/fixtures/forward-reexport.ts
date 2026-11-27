// 有意违规夹具：转发子句的全形态（非 index 文件，应逐条报错，共 5 条）。
// 由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。

export type * from "./source";
export type { RetryOptions } from "./source";
export * from "./source";
export * as ns from "./source";
export { isString } from "./source";
