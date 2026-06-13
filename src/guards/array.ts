import { _typeFunc } from '../_internal';
import type { TypeGuard } from '../types';

/**
 * 检查值是否为数组
 *
 * 等价于 `Array.isArray(val)`，支持泛型收窄。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是数组，同时收窄为 `T[]`
 *
 * @example
 * ```ts
 * if (isArray(val)) {
 *   val.push(1); // val: unknown[]
 * }
 * if (isArray<string>(val)) {
 *   val[0].toUpperCase(); // val: string[]
 * }
 * ```
 */
export const isArray = <T = unknown>(val: unknown): val is T[] =>
  Array.isArray(val);

/**
 * 检查值是否为非空数组，支持可选的元素类型守卫
 *
 * 先检查 `Array.isArray(val) && val.length > 0`，
 * 若传入 `guard`（TypeGuard 形态），则要求**所有**元素通过守卫。
 *
 * @param val — 待检查的任意值
 * @param guard — 可选的 TypeGuard 元素类型守卫（`TypeGuard<T>` 形态，TS 可正确推断 T）
 * @returns `true` 当且仅当 val 是非空数组，且所有元素通过 guard（若提供）
 *
 * @example
 * ```ts
 * if (notEmptyArray(value)) {
 *   console.log(value[0]); // value: unknown[]
 * }
 *
 * if (notEmptyArray(value, isString)) {
 *   console.log(value[0].toUpperCase()); // value: string[]
 * }
 * ```
 */
export const notEmptyArray = <T = unknown>(
  val: unknown,
  guard?: TypeGuard<T>,
): val is T[] =>
  Array.isArray(val) && val.length > 0
    ? typeof guard === _typeFunc
      ? val.every(guard as TypeGuard)
      : true
    : false;

/**
 * 柯里化的数组类型守卫
 *
 * 注意：空数组 `[]` 始终返回 `true`（全称量词对空集成立）。
 * 这意味着 `arrayGuard(isString)([])` 为 `true`，且 `[]` 被推断为 `string[]`。
 * 若下游代码假设数组非空并访问 `arr[0]`，需自行防御。
 * 如需同时保证非空，配合 {@link and} 附加长度检查。
 *
 * @param guard — 元素类型守卫
 * @returns 柯里化后的数组类型守卫函数 `TypeGuard<T[]>`
 *
 * @example
 * ```ts
 * const isStringArray = arrayGuard(isString);
 * isStringArray(['a', 'b']);   // true
 * isStringArray(['a', 1]);     // false
 * isStringArray([]);           // true ← 空数组通过！下游注意防御
 *
 * // 同时要求非空
 * const isNonEmptyStringArray = and(isStringArray, arr => arr.length > 0);
 * isNonEmptyStringArray([]);   // false
 * ```
 */
export const arrayGuard =
  <T>(guard: TypeGuard<T>): TypeGuard<T[]> =>
  (val: unknown): val is T[] =>
    Array.isArray(val) && val.every(guard);
