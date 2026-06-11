import { _typeFunc, _typeObj } from '../_internal';
import type { AnyFunction, Constructor } from '../types';

/** 内部辅助：检查值是否有 prototype 属性 */
type WithPrototype = { prototype: unknown };

/**
 * 检查值是否为可 `new` 调用的构造函数
 *
 * 箭头函数没有 `prototype`，返回 `false`；class 和普通 function 返回 `true`。
 * 支持泛型：`isConstructor<MyClass>(val)` 通过后将 val 收窄为 `Constructor<MyClass>`。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是可构造的函数（有 prototype），同时收窄为 `Constructor<T>`
 *
 * @example
 * ```ts
 * isConstructor(class Foo {});         // true  → val: Constructor<object>
 * isConstructor<Foo>(class Foo {});    // true  → val: Constructor<Foo>
 * isConstructor(() => {});             // false
 * isConstructor(null);                 // false
 * ```
 */
export const isConstructor = <T = object>(
  val: unknown,
): val is Constructor<T> =>
  typeof val === _typeFunc && !!(val as WithPrototype).prototype;

/**
 * 检查值是否为函数（包括箭头函数、class、async 函数等）
 *
 * 支持泛型收窄：传入具体函数类型后，守卫通过时 `val` 被推断为 `T`，
 * 可配合 `ReturnType<T>` / `Parameters<T>` 提取返回值类型和参数元组。
 *
 * 与 {@link isConstructor} 的区别：本函数接受所有函数类型，
 * 包括没有 `prototype` 的箭头函数。用于需要判断"是否可调用"的场景。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是函数，同时收窄为 T（默认 `AnyFunction`）
 *
 * @example
 * ```ts
 * // 基础用法
 * if (isFunction(fn)) {
 *   fn(); // fn: AnyFunction
 * }
 *
 * // 泛型收窄 — 提取返回值类型
 * declare const maybeFn: unknown;
 * if (isFunction<() => string>(maybeFn)) {
 *   const result: string = maybeFn(); // ✅ 类型正确收窄
 * }
 *
 * // 泛型收窄 — 配合 ReturnType / Parameters
 * type MyFn = (a: number, b: string) => boolean;
 * if (isFunction<MyFn>(val)) {
 *   type R = ReturnType<typeof val>;   // boolean
 *   type P = Parameters<typeof val>;   // [number, string]
 * }
 * ```
 */
export const isFunction = <T extends AnyFunction = AnyFunction>(
  val: unknown,
): val is T => typeof val === _typeFunc;

/**
 * 检查值是否为 Promise（或符合 TS Promise 接口的 thenable）
 *
 * 注意：本函数检测的是 TypeScript 的 `Promise<T>` 类型（需同时具有 `then`
 * 和 `catch` 方法），而非 Promise/A+ 规范的 thenable（后者只需 `then`）。
 * 因此合法的 A+ thenable `{ then: fn }` 会被判为 `false`。
 *
 * **安全提示**：任何符合此签名的对象都会被判定为 Promise。
 * 下游若对其执行 `await` 或 `.then()`，需注意恶意 thenable 可能同步调用回调、
 * 多次调用回调、或永不调用回调。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是 `Promise` 实例或具有 `then` + `catch` 方法的 thenable
 *
 * @example
 * ```ts
 * if (isPromise(value)) {
 *   await value;
 * }
 * ```
 */
export const isPromise = <T = unknown>(val: unknown): val is Promise<T> =>
  val instanceof Promise ||
  (typeof val === _typeObj &&
    val !== null &&
    typeof (val as Promise<T>).then === _typeFunc &&
    typeof (val as Promise<T>).catch === _typeFunc);
