import { _typeFunc, _typeObj } from '../_internal';
import type { TypeGuard } from '../types';

/**
 * 检查值是否为一个普通对象
 *
 * "普通对象"定义为原型为 `Object.prototype` 或 `null` 的非数组对象。
 * 这排除了 `Array`、`Date`、`Map`、`Set`、`Error`、`RegExp` 等所有内置类实例。
 *
 * 支持泛型：`isPlainObject<MyType>(val)` 通过后将 `val` 收窄为 `MyType`。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是普通对象，同时收窄为 T（默认 `Record<string, unknown>`）
 *
 * @example
 * ```ts
 * if (isPlainObject(value)) {
 *   console.log(Object.keys(value));
 * }
 * isPlainObject({});              // true
 * isPlainObject(Object.create(null)); // true（null 原型）
 * isPlainObject([]);              // false
 * isPlainObject(new Date());      // false
 * ```
 */
export const isPlainObject = <
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
 * 检查 obj 是否为对象（非 null、非数组），结果为真时推导 obj 为 T
 *
 * 与 {@link isPlainObject} 的区别：本函数**不**排除 `Date`、`Map`、`Set`、`Error`
 * 等内置类实例，只做最基础的 `typeof === 'object' && !Array.isArray()` 检查。
 * 如需严格判断"纯对象"，请用 {@link isPlainObject}。
 *
 * 泛型行为：
 * - 不指定 T → 默认 `Record<string, unknown>`
 * - 指定 T 但不传 guard → obj 直接推断为 T（运行时只做 typeof 检查）
 * - 传入 guard → 在 typeof 检查通过后附加 guard 判定。guard 签名为 `(it: T) => boolean`，
 *   但也可以传 TypeGuard 型函数（`(it: T) => it is T`），TS 同样接受且行为一致
 *
 * @param obj — 任意类型变量
 * @param guard — 可选的附加断言函数，签名 `(it: T) => boolean`
 * @returns `true` 当且仅当 obj 是非 null 对象（非数组）且 guard（若提供）返回 true
 *
 * @example
 * ```ts
 * // 基础：指定 T 收窄
 * type TestA = { name?: string };
 * if (isInferObject<TestA>(obj)) {
 *   console.log(obj.name || 'noname'); // obj: TestA
 * }
 *
 * // 带 guard 做附加验证
 * type TestB = { name: string };
 * if (isInferObject<TestB>(obj, it => typeof it.name === 'string')) {
 *   console.log(obj.name); // obj: TestB 且 name 是 string
 * }
 *
 * // guard 可以是 TypeGuard，省略显式泛型
 * type WithVersion = { version: number };
 * const isWithVersion = (it: WithVersion): it is WithVersion =>
 *   typeof it.version === 'number';
 * if (isInferObject(val, isWithVersion)) {
 *   val.version += 1; // val: WithVersion
 * }
 * ```
 */
export const isInferObject = <T = Record<string, unknown>>(
  obj: unknown,
  guard?: (it: T) => boolean,
): obj is T =>
  obj != null && typeof obj === _typeObj && !Array.isArray(obj)
    ? typeof guard === _typeFunc
      ? (guard as TypeGuard)(obj as T)
      : true
    : false;
