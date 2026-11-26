// 入口纪律夹具（round07 F-01）：src/ 下的 index.ts 不写实现——export default
// 的本地 function 声明报 1 条。一个文件只能有一条 default，default 声明的各
// 形态分文件钉。由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要
// 「修复」本文件。
export default function localFn() { return 1 }
