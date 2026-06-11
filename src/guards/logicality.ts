import type { InferGuard, TypeGuard } from '../types';

/**
 * 组合守卫（AND）
 *
 * 所有守卫按顺序执行，**短路求值**——任一失败立即返回 `false`，不执行后续守卫。
 * 第一个守卫收窄类型到 T，后续守卫在 T 上做进一步筛选。
 * 全部通过后 val 被收窄为 T。
 *
 * @param guards — 第一个为 TypeGuard `<T>`（类型守卫），后续为 `(val: T) => boolean`（断言函数）
 * @returns 组合后的 TypeGuard `<T>`
 *
 * @example
 * ```ts
 * const isStringArray = arrayGuard(isString);
 * const isNonEmptyStringArray = and(isStringArray, arr => arr.length > 0);
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
 * 任意一个守卫通过即返回 `true`，**短路求值**——首个通过后不再执行后续守卫。
 * 自动推断所有守卫的联合类型作为返回值。
 *
 * @param guards — 一个或多个 TypeGuard 函数
 * @returns 组合后的 TypeGuard，收窄类型为各守卫类型的联合
 *
 * @example
 * ```ts
 * const isStringOrNumber = or(isString, isNumber);
 * if (isStringOrNumber(value)) {
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
 * 运行时对守卫结果取反。**重要限制**：由于 TypeScript 类型系统不支持否定类型，
 * 返回值类型为 `(val: unknown) => boolean`，**不会进行类型收窄**。
 * 换言之，`if (not(isNull)(val))` 块内 val 仍为原始类型，不会被排除 `null`。
 *
 * @param guard — 要取反的 TypeGuard 函数
 * @returns 取反后的判断函数 `(val: unknown) => boolean`（非 TypeGuard）
 *
 * @example
 * ```ts
 * const isNotNull = not(isNull);
 * if (isNotNull(value)) {
 *   // 运行时正确，但 TS 不会收窄 value 的类型
 * }
 * ```
 */
export const not = (guard: TypeGuard): ((val: unknown) => boolean) => {
  return (val: unknown) => !guard(val);
};
