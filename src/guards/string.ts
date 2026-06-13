import { _typeStr } from '../_internal';

/**
 * 判定 val 是否为字符串原始类型（含类型收窄）
 *
 * 仅检查 `typeof val === 'string'`，不接受 `new String()` 包装对象。
 * 后者在现代代码中几乎绝迹，且 `typeof` 为 `'object'`，会产生类型谎言。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是字符串原始类型，同时将 val 收窄为 `string`
 *
 * @example
 * ```ts
 * if (isString(val)) {
 *   val.toUpperCase(); // ✅ val: string
 * }
 * isString(new String('hello')); // false（不收窄包装对象）
 * ```
 *
 * @see https://stackoverflow.com/questions/4059147/check-if-a-variable-is-a-string-in-javascript
 */
export const isString = (val: unknown): val is string =>
  typeof val === _typeStr;

/**
 * 检查 val 是否为非空字符串（trim 后长度 > 0，含类型收窄）
 *
 * 先通过 {@link isString} 判定，再检查 `val.trim().length > 0`。
 * 纯空白字符串（`' '`、`'\t'`、`'\n'` 等）视为空，返回 `false`。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是 trim 后长度大于 0 的字符串，同时收窄为 `string`
 *
 * @example
 * ```ts
 * notEmptyString('hello');  // true
 * notEmptyString(' ');      // false（纯空白视为空）
 * notEmptyString('');       // false
 * notEmptyString(null);     // false
 * ```
 */
export const notEmptyString = (val: unknown): val is string =>
  isString(val) && val.trim().length > 0;
