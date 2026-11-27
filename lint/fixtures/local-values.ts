// 负例夹具：本地值与类型组合（不应报错，0 条诊断）。
// export const c = localConfig 是本地值的别名，import 关联不到就不报；
// Omit<...> 改写了类型，不算转发；给导入的泛型加类型实参（Wrapper<string>）
// 是构造新类型，也不算转发。由 lint/no-cross-file-reexport.test.ts 断言。

import type { RetryOptions, SessionOptions, Wrapper } from "./source";
import * as src from "./source";
import { isString } from "./source";

const localConfig = { a: 1 };
export const c = localConfig;
export const arr = [isString];
export const wrap = () => isString;
export type U = Omit<SessionOptions, "a">;
type Local = { b: string };
export type L2 = Local;
export type WG = Wrapper<string>;
export type WGP = Wrapper<string>;
// 解构导出是取字段 / 取成员，不是把导入名再送出去——左值不是简单标识符绑定就不报
export const { length: nlen } = isString as unknown as { length: number };
export const { length: fromLocal } = { length: 3 };
export const { isString: S_dest } = src;
// 声明导入名的别名但未导出：没有送出模块，不报
const hidden = isString;
// 后置 export 关联的负例边界：右值是本地值，后置导出不报
const c2 = localConfig;

export { c2 };

type LS = Local;

export type { LS };

// 函数 / 块内与后置导出同名的声明不是顶层绑定，不报；顶层同名声明右值本地，也不报
const S = localConfig;
function helper() {
	const S = isString;
	return S;
}

export { S };

type LT = Local;
function typeHelper() {
	type LT = RetryOptions;
	return null as unknown as LT;
}

export type { LT };
