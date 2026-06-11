/**
 * 检查值是否为 null
 *
 * 严格 `=== null`。与 `== null` 不同，后者也匹配 `undefined`。
 * 如需同时匹配 null 和 undefined，使用 {@link isNil}。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val === null，同时收窄为 `null`
 *
 * @example
 * ```ts
 * isNull(null);       // true
 * isNull(undefined);  // false
 * isNull(0);          // false
 * ```
 */
export const isNull = (val: unknown): val is null => val === null;

/**
 * 检查值是否为 undefined
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val === undefined，同时收窄为 `undefined`
 *
 * @example
 * ```ts
 * isUndefined(undefined);  // true
 * isUndefined(null);       // false
 * ```
 */
export const isUndefined = (val: unknown): val is undefined => val === undefined;

/**
 * 检查值是否为 null 或 undefined
 *
 * 等价于 `val == null`（宽松比较）的行为，但使用显式 `===` 检查。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是 null 或 undefined，同时收窄为 `null | undefined`
 */
export const isNil = (val: unknown): val is null | undefined =>
  val === null || val === undefined;

/**
 * 检查值是否不为 null 且不为 undefined（非空断言）
 *
 * 是 {@link isNil} 的逻辑取反。通过后 TS 从 `T | null | undefined` 中排除
 * `null` 和 `undefined`，收窄为 `T`。
 *
 * @param val — 待检查的值（类型为 `T | null | undefined`）
 * @returns `true` 当且仅当 val 既非 null 也非 undefined，同时收窄为 `T`
 *
 * @example
 * ```ts
 * const value: string | null | undefined = 'hello';
 * if (isPresent(value)) {
 *   value.toUpperCase(); // value: string
 * }
 * isPresent(null);       // false
 * isPresent(undefined);  // false
 * ```
 */
export const isPresent = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined;
