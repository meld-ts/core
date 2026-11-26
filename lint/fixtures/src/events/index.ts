// 例外夹具（round06 F-01）：src/events/index.ts 是 AGENTS.md 已列的例外（入口直接写
// 实现），入口分支豁免，本地类型声明与本地实现不报；其余五支照报——本文件的逐个
// 列举报 1 条。由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
export type LocalThing = { a: number };
export const impl = () => 2;
export { isString } from '../source';
