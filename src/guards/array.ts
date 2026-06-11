import { _typeFunc } from '../_internal';
import type { TypeGuard } from '../types';

/**
 * 检查值是否为数组
 *
 * @param val 任意值
 */
export const isAry = <T = unknown>(val: unknown): val is T[] =>
  Array.isArray(val);

/**
 * 检查值是否为非空数组，支持可选的元素类型守卫
 *
 * @param val 任意值
 * @param guard 可选的元素类型守卫
 *
 * @example
 * ```ts
 * if (notEmptyAry(value)) {
 *   console.log(value[0]); // value is unknown[]
 * }
 *
 * if (notEmptyAry(value, isStr)) {
 *   console.log(value[0].toUpperCase()); // value is string[]
 * }
 * ```
 */
export const notEmptyAry = <T = unknown>(
  val: unknown,
  guard?: (it: T) => boolean,
): val is T[] =>
  Array.isArray(val) && val.length
    ? typeof guard === _typeFunc
      ? val.every(guard as TypeGuard)
      : true
    : false;

/**
 * 柯里化的数组类型守卫
 *
 * 注意：空数组 `[]` 始终返回 `true`（全称量词对空集成立）。
 * 若需同时保证非空，配合 `and` 附加长度检查：
 *
 * @param guard 元素类型守卫
 * @returns 数组类型守卫函数
 *
 * @example
 * ```ts
 * const isStrAry = aryGuard(isStr);
 * isStrAry([])        // true  ← 空数组通过
 * isStrAry(['a'])     // true
 * isStrAry([1])       // false
 *
 * // 同时要求非空
 * const isNonEmptyStrAry = and(isStrAry, (arr) => arr.length > 0);
 * ```
 */
export const aryGuard =
  <T>(guard: TypeGuard<T>): TypeGuard<T[]> =>
  (val: unknown): val is T[] =>
    Array.isArray(val) && val.every(guard);
