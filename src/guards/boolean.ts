import { _typeBool } from '../_internal';
import { isNumber } from './number';
import { isString } from './string';

const _strTrue = 'true' as const;
const _strFalse = 'false' as const;
const _strYes = 'yes' as const;
const _strNo = 'no' as const;

/**
 * 检查值是否为布尔值
 *
 * 仅 `typeof val === 'boolean'` 为真。数字 `0`/`1`、字符串 `'true'`/`'false'` 均返回 `false`。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是原始布尔类型，同时收窄为 `boolean`
 *
 * @example
 * ```ts
 * if (isBoolean(value)) {
 *   console.log(value ? 'yes' : 'no');
 * }
 * isBoolean(0);       // false
 * isBoolean('true');  // false
 * ```
 */
export const isBoolean = (val: unknown): val is boolean =>
  typeof val === _typeBool;

/**
 * 将任意值转换为布尔值
 *
 * 转换规则（按优先级）：
 * - `null` / `undefined` → `false`
 * - 布尔值 → 原值
 * - 数字 → `> 0` 为 `true`，否则 `false`（含 `0`、负数、`NaN`）
 * - 字符串（不区分大小写）：
 *   - `'true'` / `'yes'` → `true`
 *   - `'false'` / `'no'` → `false`
 *   - 其他 → 委托 `Boolean(val)`（非空为 `true`，空串为 `false`）
 * - 其他 → 委托 `Boolean(val)`
 *
 * @param val — 任意值
 * @returns 转换后的布尔值
 *
 * @example
 * ```ts
 * toBoolean(null);      // false
 * toBoolean(1);         // true
 * toBoolean(0);         // false
 * toBoolean('true');    // true
 * toBoolean('yes');     // true
 * toBoolean('false');   // false
 * toBoolean('no');      // false
 * toBoolean('hello');   // true  （非空字符串）
 * toBoolean('');        // false （空字符串）
 * toBoolean({});        // true
 * ```
 */
export const toBoolean = (val: unknown): boolean => {
  if (val == null) return false;
  if (typeof val === _typeBool) return val as boolean;
  if (isNumber(val)) return (val as number) > 0;
  if (isString(val)) {
    const lower = val.toLowerCase();
    if (lower === _strTrue || lower === _strYes) return true;
    if (lower === _strFalse || lower === _strNo) return false;
    return Boolean(val);
  }
  return Boolean(val);
};
