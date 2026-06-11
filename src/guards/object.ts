import { _typeFunc, _typeObj } from '../_internal';
import type { Constructor, TypeGuard, WithPrototype } from '../types';

/**
 * 检查值是否为一个普通对象（不包括数组、Date、RegExp 等特殊对象）
 *
 * @param val 任意值
 *
 * @example
 * ```ts
 * if (isPlainObj(value)) {
 *   console.log(Object.keys(value));
 * }
 * ```
 */
export const isPlainObj = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  val: unknown,
): val is T =>
  typeof val === _typeObj &&
  val !== null &&
  !Array.isArray(val) &&
  (Object.getPrototypeOf(val) === Object.prototype ||
    Object.getPrototypeOf(val) === null);

/**
 * 检查 obj 是否为对象（非 null、非数组），结果为真时推导 obj 为 T 类型
 *
 * 与 {@link isPlainObj} 的区别：本函数**不**排除 `Date`、`Map`、`Set`、`Error`
 * 等内置类实例，只做最基础的 `typeof === 'object'` 检查。
 * 如需严格判断"纯对象"，请用 {@link isPlainObj}。
 *
 * - 未指定泛型 T，则 T 默认为 `Record<string, unknown>`
 * - 如果指定泛型 T ，而未传入 fn ，只要 obj 是 Object 即推断 obj 为 T
 * ```ts
 * type TestA = {
 *   name?: string;
 * }
 *
 * if (isInferObj<TestA>(obj)) {
 *   // obj 推断为 TestA
 *   console.log(obj.name || 'noname');
 * }
 * ```
 * - 若果传入了 fn ，则先检查是否 Object，再附加 fn 结果进行推断
 * ```ts
 * type TestB = {
 *   name: string;
 * }
 *
 * if (isInferObj<TestB>(obj, it => typeof it.name === 'string')) {
 *   // obj 推断为 TestB
 *   console.log(obj.name);
 * }
 * ```
 * - 通过传入 `x is T` 的 fn ，可省略指定泛型 T（一般用于复杂的结构判定）
 * ```ts
 * // 由 fn 的结果推导 isInferObj 的 T
 * type WithVersion = {
 *  version: number;
 * };
 *
 * const isWithVersion = (it: WithVersion): it is WithVersion =>
 *   typeof it.version === 'number';
 *
 * const ver1 = { ver: 1 };
 * const ver2 = { version: 2 };
 *
 * if (isInferObj(ver1, isWithVersion)) {
 *   // 不符合
 * }
 *
 * if (isInferObj(ver2, isWithVersion)) {
 *   // ver2 推断为 Version
 *   ver2.version += 1;
 * }
 * ```
 *
 * @param obj 任意类型变量
 * @param guard 断言类型判断函数
 */
export const isInferObj = <T = Record<string, unknown>>(
  obj: unknown,
  guard?: (it: T) => boolean,
): obj is T =>
  obj != null && typeof obj === _typeObj && !Array.isArray(obj)
    ? typeof guard === _typeFunc
      ? (guard as TypeGuard)(obj as T)
      : true
    : false;

/**
 * 检查值是否为可 `new` 调用的构造函数（class 或普通函数）
 *
 * 箭头函数没有 `prototype`，返回 `false`；class 和普通函数返回 `true`。
 *
 * @param val 任意值
 *
 * @example
 * ```ts
 * isCtor(class Foo {})        // true  → val is Constructor<object>
 * isCtor<Foo>(class Foo {})   // true  → val is Constructor<Foo>
 * isCtor(() => {})             // false
 * isCtor(null)                 // false
 * ```
 */
export const isCtor = <T = object>(val: unknown): val is Constructor<T> =>
  typeof val === _typeFunc && !!(val as WithPrototype).prototype;

/**
 * 检查值是否为 Promise
 *
 * @param val 任意值
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
    typeof (val as Promise<T>)?.then === _typeFunc &&
    typeof (val as Promise<T>)?.catch === _typeFunc);
