import type { InferGuard, TypeGuard } from '../types';

/**
 * 组合守卫（AND）
 *
 * 第一个守卫收窄类型到 T，后续守卫在 T 上做进一步筛选
 *
 * @param guards 第一个为类型守卫，后续为断言函数
 * @returns 组合后的守卫函数
 *
 * @example
 * ```ts
 * const isStrAry = aryGuard(isStr);
 * const isNonEmptyStrAry = and(isStrAry, (arr) => arr.length > 0);
 * ```
 */
export const and = <T>(
  ...guards: [(val: unknown) => val is T, ...((val: T) => boolean)[]]
): TypeGuard<T> => {
  return (val: unknown): val is T => {
    for (const guard of guards) {
      if (!(guard as (v: unknown) => boolean)(val)) return false;
    }
    return true;
  };
};

/**
 * 组合守卫（OR）
 *
 * 任意一个守卫通过即返回 true，自动推断联合类型
 *
 * @param guards 一个或多个守卫函数
 * @returns 组合后的守卫函数
 *
 * @example
 * ```ts
 * const isStrOrNum = or(isStr, isNumber);
 * if (isStrOrNum(value)) {
 *   // value: string | number
 * }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: TypeGuard<any> needed for generic inference
export const or = <G extends [TypeGuard<any>, ...TypeGuard<any>[]]>(
  ...guards: G
): TypeGuard<InferGuard<G[number]>> => {
  return (val: unknown): val is InferGuard<G[number]> => {
    for (const guard of guards) {
      if (guard(val)) return true;
    }
    return false;
  };
};

/**
 * 守卫取反（NOT）
 *
 * 返回运行时取反函数。由于 TS 类型系统不支持否定类型，
 * 返回值为 `(val: unknown) => boolean`，不作为类型守卫使用。
 *
 * @param guard 要取反的守卫函数
 * @returns 取反后的判断函数
 *
 * @example
 * ```ts
 * const isNotNull = not(isNull);
 * if (isNotNull(value)) {
 *   // 运行时正确，但不会收窄类型
 * }
 * ```
 */
export const not = (guard: TypeGuard): ((val: unknown) => boolean) => {
  return (val: unknown) => !guard(val);
};
