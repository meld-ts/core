/**
 * 检查值是否为 null
 *
 * @param val 任意值
 */
export const isNull = (val: unknown): val is null => val === null;

/**
 * 检查值是否为 undefined
 *
 * @param val 任意值
 */
export const isUndef = (val: unknown): val is undefined => val === undefined;

/**
 * 检查值是否为 null 或 undefined
 *
 * @param val 任意值
 */
export const isNil = (val: unknown): val is null | undefined =>
  val === null || val === undefined;

/**
 * 检查值是否不为 null 且不为 undefined
 *
 * @param val 任意值
 *
 * @example
 * ```ts
 * if (isPresent(value)) {
 *   console.log(value);
 * }
 * ```
 */
export const isPresent = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined;
