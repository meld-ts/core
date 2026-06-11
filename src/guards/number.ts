import {
  _errDenominatorZero,
  _numZero,
  _typeBool,
  _typeNum,
  _typeStr,
  _typeUndef,
} from '../_internal';

/**
 * 判断是否为有效的数字类型
 *
 * @param val
 */
export const isNumber = (val: unknown): val is number =>
  typeof val === _typeNum && !Number.isNaN(val) && Number.isFinite(val);

/**
 * 判断值是否可被解析为有效数值（`toNumber` 的宽松前置检查）
 *
 * 使用 `parseFloat` 语义：字符串只要**前缀能解析出有限数字**即返回 `true`，
 * 如 `'123abc'` → `123`（有效），与 `isNumber` 的严格全值检查不同。
 *
 * - 数字类型：同 {@link isNumber}（有限、非 NaN）
 * - 字符串类型：`parseFloat` 能得到有限非 NaN 数字即为 `true`，
 *   空串 `''`、纯空白 `' '` 和 `'abc'` 均返回 `false`
 *
 * @param val
 */
export const isNumberVal = (val: unknown): boolean => {
  if (typeof val === _typeStr) {
    const _v = Number.parseFloat(val as string);
    return !Number.isNaN(_v) && Number.isFinite(_v);
  }
  return isNumber(val);
};

/**
 * 将包含有效数值的 val 转换为对应的数字类型，只支持以下情形：
 *
 * - 字符串包含数值，如 `"123"`，转换为 `123`
 * - 数字类型，如 `123`，转换为 `123`
 * - 布尔类型，如 `true`，转换为 `1`，`false` 转换为 `0`
 *
 * @param val
 * @param dft 默认值，仅当 val 为 `null` 或 `undefined` 或 非包含有效数值时生效
 */
export const toNumber = (val: unknown, dft = _numZero): number => {
  if (typeof val === _typeBool) return val ? 1 : 0;
  if (isNumber(val)) return val;
  if (val == null || !isNumberVal(val)) return dft;
  return Number.parseFloat(val as string);
};

/**
 * 限制 val 在最小值范围内
 *
 * @param val
 * @param {number} min 最小值
 * @param {number} dft 默认值，仅当 val 为 `null` 或 `undefined` 或 非包含有效数值时生效
 */
export const limitNumberMin = (val: unknown, min: number, dft = _numZero) => {
  const v = toNumber(val, dft);
  return v < min ? min : v;
};

/**
 * 限制 val 在最大值范围内
 * @param val
 * @param max 最大值
 * @param dft 默认值，仅当 val 为 `null` 或 `undefined` 或 非包含有效数值时生效
 */
export const limitNumberMax = (val: unknown, max: number, dft = _numZero) => {
  const v = toNumber(val, dft);
  return v > max ? max : v;
};

/**
 * 限制 val 在最小值和最大值范围内
 * @param val
 * @param min 最小值
 * @param max 最大值
 * @param dft 默认值，仅当 val 为 `null` 或 `undefined` 或 非包含有效数值时生效
 */
export const limitNumberMinMax = (
  val: unknown,
  min: number,
  max: number,
  dft = _numZero,
) => {
  const v = toNumber(val, dft);
  return v < min ? min : v > max ? max : v;
};

/**
 * 数字精度调整，支持 `round`、`ceil`、`floor` 三种类型
 *
 * @see https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Math/round#%E5%B0%8F%E6%95%B0%E8%88%8D%E5%85%A5
 * @param {'round' | 'ceil' | 'floor'} type 调整类型
 * @param {number} value
 * @param {number} exp 指数（10的 exp 次方 —— 10 进制位数，0 表示个位，1 表示十位，-1 表示小数点后一位，-2
 *   表示小数点后两位，以此类推）。
 * @returns {number}
 */
export const decimalAdjust = (
  type: 'round' | 'ceil' | 'floor',
  value: number,
  exp?: number,
): number => {
  let _value: number = value;
  let _exp = exp;
  if (typeof _exp === _typeUndef || +(_exp as number) === 0) {
    return Math[type](_value as number);
  }
  _value = +_value;
  _exp = +(_exp as number);
  if (
    Number.isNaN(_value as number) ||
    !(typeof _exp === _typeNum && _exp % 1 === 0)
  ) {
    return Number.NaN;
  }
  let _parts = (_value as number).toString().split('e');
  _value = Math[type](
    // biome-ignore lint/style/useTemplate: preserve original logic
    +(_parts[0] + 'e' + (_parts[1] ? +_parts[1] - _exp : -_exp)),
  ) as number;
  _parts = (_value as number).toString().split('e');
  // biome-ignore lint/style/useTemplate: preserve original logic
  return +(_parts[0] + 'e' + (_parts[1] ? +_parts[1] + _exp : _exp));
};

export const round10 = (value: number, exp?: number): number =>
  decimalAdjust('round', value, exp);

export const floor10 = (value: number, exp?: number): number =>
  decimalAdjust('floor', value, exp);

export const ceil10 = (value: number, exp?: number): number =>
  decimalAdjust('ceil', value, exp);

/**
 * 计算进度值，返回的结果为一个浮点值，表示进度比例，取值在 0 - 1 之间。
 *
 * @param value
 * @param total
 */
export const calcProgress = (value: number, total: number) => {
  if (total === 0 || !isNumber(total)) {
    throw new Error(_errDenominatorZero);
  }
  return limitNumberMinMax(round10(value / total, -2), 0, 1);
};
