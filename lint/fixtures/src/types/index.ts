// 例外夹具（round06 F-01）：src/types/index.ts 是 AGENTS.md 已列的例外（单文件模块），
// 入口分支豁免，本地类型声明与本地实现不报；其余五支照报——本文件的两步换名报
// 1 条。由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
import { isNumber } from "../source";
export type LocalAlias = { b: string };
export const M = 1;
const N2 = isNumber;

export { N2 };
