import { _strFalse, _strNo, _strTrue, _strYes, _typeBool } from '../_internal';
import { isNumber } from './number';
import { isStr } from './string';

/**
 * 检查值是否为布尔值
 *
 * @param val 任意值
 *
 * @example
 * ```ts
 * if (isBool(value)) {
 *   console.log(value ? 'yes' : 'no');
 * }
 * ```
 */
export const isBool = (val: unknown): val is boolean =>
  typeof val === _typeBool;

/**
 * 将任意值转为布尔值
 *
 * 转换规则：
 * - `null` / `undefined` → `false`
 * - 布尔值 → 原值
 * - 数字 → `> 0` 为 `true`，否则 `false`（含 `0`、负数、`NaN`）
 * - 字符串（不区分大小写）：
 *   - `'true'` / `'yes'` → `true`
 *   - `'false'` / `'no'` → `false`
 *   - 其他 → 委托 `Boolean(val)`（非空为 `true`，空串为 `false`）
 * - 其他 → 委托 `Boolean(val)`
 *
 * @param val 任意值
 *
 * @example
 * ```ts
 * toBool(null)     // false
 * toBool(1)        // true
 * toBool(0)        // false
 * toBool('true')   // true
 * toBool('yes')    // true
 * toBool('false')  // false
 * toBool('no')     // false
 * toBool('hello')  // true  （非空字符串）
 * toBool('')       // false （空字符串）
 * toBool({})       // true
 * ```
 */
export const toBool = (val: unknown): boolean => {
  if (val == null) return false;
  if (typeof val === _typeBool) return val as boolean;
  if (isNumber(val)) return (val as number) > 0;
  if (isStr(val)) {
    const lower = val.toLowerCase();
    if (lower === _strTrue || lower === _strYes) return true;
    if (lower === _strFalse || lower === _strNo) return false;
    return Boolean(val);
  }
  return Boolean(val);
};
