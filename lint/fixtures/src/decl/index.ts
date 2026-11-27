// 入口纪律夹具（round07 F-01）：src/ 下的 index.ts 不声明类型——declare 族
// 四形态：export declare 的 function / class / const 各报 1 条，无 export 的
// declare 语句报 1 条，共 4 条。由 lint/no-cross-file-reexport.test.ts 断言
// 诊断数，不要「修复」本文件。
export declare function ambientFn(): void;
export declare class Ambient {
	a: string;
}
export declare const version: string;
declare const ambient: string;
