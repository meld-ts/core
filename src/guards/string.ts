import { _typeStr } from '../_internal';

/**
 * 判定 val 是否为字符串类型（含 infer）
 *
 * @see https://stackoverflow.com/questions/4059147/check-if-a-variable-is-a-string-in-javascript
 * @param val
 */
export const isStr = (val: unknown): val is string =>
  typeof val === _typeStr || val instanceof String;

/**
 * 检查 val 是否为非空字符串（含 infer）
 *
 * @param val
 */
export const notEmptyStr = (val: unknown): val is string =>
  isStr(val) && val.length > 0;
