// 路径含 /test/ 的 src 入口夹具（round08 F-01）：与 src/index.ts 同内容，
// 唯一区别是文件路径多一段 test/（…/fixtures/test/src/index.ts）。入口纪律
// 与检出路径无关：路径含 test/ 段时入口分支照报、五类让位照让，诊断数与
// 无 test/ 对照（src/index.ts）同为 13 条。由
// lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。

import type { RetryOptions, Wrapper } from "../../source";
import { isNumber, isString } from "../../source";

export type * from "../../source";
export type { RetryOptions } from "../../source";
export * from "../../source";
export * as ns from "../../source";
export { isString } from "../../source";
export const N = isNumber;
export type RO = RetryOptions;
export default isNumber;
export interface Extra {
	a: string;
}
export type LocalAlias = { b: number };
export const helper = () => 1;
const local = 1;

export { local };

const hidden = isString;
export type Spec = Wrapper<string>;
export type Composed = Omit<Wrapper<string>, "value">;
