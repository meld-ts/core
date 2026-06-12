import {
  _errDenominatorZero,
  _numZero,
  _typeBool,
  _typeNum,
  _typeStr,
} from '../_internal';

/**
 * 判断是否为有效的数字类型（有限、非 NaN）
 *
 * 排除 `NaN`、`Infinity`、`-Infinity`，包含 `0`、`-0`、整数和浮点数。
 * `typeof val === 'number'` 是前提——字符串 `'123'` 返回 `false`。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是有限数字，同时收窄为 `number`
 *
 * @example
 * ```ts
 * isNumber(123);     // true
 * isNumber(-0);      // true
 * isNumber(NaN);     // false
 * isNumber('123');   // false（不是 number 类型）
 * ```
 */
export const isNumber = (val: unknown): val is number =>
  typeof val === _typeNum && !Number.isNaN(val) && Number.isFinite(val);

/**
 * 判断是否为整数（有限、非 NaN）
 *
 * 在 {@link isNumber} 基础上附加 `Number.isInteger` 检查。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是有限整数，同时收窄为 `number`
 *
 * @example
 * ```ts
 * isInt(3);      // true
 * isInt(3.14);   // false
 * isInt('3');    // false
 * ```
 */
export const isInt = (val: unknown): val is number =>
  isNumber(val) && Number.isInteger(val);

/**
 * 判断值是否可被解析为有效数值
 *
 * 使用 `parseFloat` 语义：字符串只要**前缀能解析出有限数字**即返回 `true`，
 * 如 `'123abc'` → `123`（有效），与 {@link isNumber} 的严格全值检查不同。
 *
 * `parseFloat` 会自动 trim 前后空白（`'  123  '` → `123`），所以空白包围的数字也通过。
 *
 * - 数字类型：同 {@link isNumber}（有限、非 NaN）
 * - 字符串类型：`parseFloat` 能得到有限非 NaN 数字即为 `true`，
 *   空串 `''`、纯空白 `' '`、非数字前缀 `'abc'` 均返回 `false`
 * - 其他类型：均返回 `false`
 *
 * @param val — 待检查的任意值
 * @returns `true` 若 val 可被解析为有限数字
 */
export const isNumberVal = (val: unknown): boolean => {
  if (typeof val === _typeStr) {
    const _v = Number.parseFloat(val as string);
    return !Number.isNaN(_v) && Number.isFinite(_v);
  }
  return isNumber(val);
};

/**
 * 将 val 转换为数字类型
 *
 * 转换规则（按优先级）：
 * 1. 布尔值 → `true` → 1，`false` → 0
 * 2. 有效数字（{@link isNumber}）→ 原值
 * 3. `null` / `undefined` → 返回 `dft`（默认 0）
 * 4. 非可解析值 → 返回 `dft`
 * 5. 可解析字符串（{@link isNumberVal}）→ `parseFloat` 结果
 *
 * **静默行为**：`NaN`、`Infinity`、不可解析对象等均返回 `dft`，不抛异常。
 *
 * @param val — 待转换的任意值
 * @param dft — val 无法转换时返回的默认值（默认 0）
 * @returns 转换后的数字，或 dft
 *
 * @example
 * ```ts
 * toNumber('123');     // 123
 * toNumber(true);      // 1
 * toNumber(false);     // 0
 * toNumber('abc');     // 0（dft 默认值）
 * toNumber(null, -1);  // -1（自定义 dft）
 * ```
 */
export const toNumber = (val: unknown, dft: number = _numZero): number => {
  if (typeof val === _typeBool) return val ? 1 : 0;
  if (isNumber(val)) return val;
  if (val == null || !isNumberVal(val)) return dft;
  return Number.parseFloat(val as string);
};

/**
 * 限制 val 不小于 min
 *
 * 先通过 {@link toNumber} 转换 val（无法转换时用 dft），再与 min 比较取较大值。
 *
 * @param val — 待限制的值（任意类型，经 toNumber 转换）
 * @param min — 下限
 * @param dft — val 无法转换时使用的默认值（默认 0）
 * @returns `Math.max(toNumber(val, dft), min)`
 *
 * @example
 * ```ts
 * limitNumberMin(50, 100);     // 100
 * limitNumberMin(150, 100);    // 150
 * limitNumberMin('abc', 100);  // 100（dft=0，取 max(0, 100)）
 * ```
 */
export const limitNumberMin = (
  val: unknown,
  min: number,
  dft: number = _numZero,
) => {
  const v = toNumber(val, dft);
  return v < min ? min : v;
};

/**
 * 限制 val 不大于 max
 *
 * 先通过 {@link toNumber} 转换 val，再与 max 比较取较小值。
 *
 * @param val — 待限制的值
 * @param max — 上限
 * @param dft — val 无法转换时使用的默认值（默认 0）
 * @returns `Math.min(toNumber(val, dft), max)`
 *
 * @example
 * ```ts
 * limitNumberMax(50, 100);     // 50
 * limitNumberMax(150, 100);    // 100
 * ```
 */
export const limitNumberMax = (
  val: unknown,
  max: number,
  dft: number = _numZero,
) => {
  const v = toNumber(val, dft);
  return v > max ? max : v;
};

/**
 * 限制 val 在 [min, max] 区间内
 *
 * 先通过 {@link toNumber} 转换 val，再钳制到闭区间。
 * **前提**：`min <= max`，否则行为由 `Math.min`/`Math.max` 决定（取 max 端）。
 *
 * @param val — 待限制的值
 * @param min — 下限
 * @param max — 上限
 * @param dft — val 无法转换时使用的默认值（默认 0）
 * @returns 钳制后的值，满足 `min <= result <= max`
 *
 * @example
 * ```ts
 * limitNumberMinMax(50, 0, 100);    // 50
 * limitNumberMinMax(-10, 0, 100);   // 0
 * limitNumberMinMax(200, 0, 100);   // 100
 * ```
 */
export const limitNumberMinMax = (
  val: unknown,
  min: number,
  max: number,
  dft: number = _numZero,
) => {
  const v = toNumber(val, dft);
  return Math.min(max, Math.max(min, v));
};

/**
 * 数字精度调整（底层函数）
 *
 * 使用 e-notation 移位法避免浮点精度问题。
 *
 * @param type — 调整类型：`'round'` 四舍五入 / `'ceil'` 向上取整 / `'floor'` 向下取整
 * @param value — 要调整的数值
 * @param exp — 指数（10 的 exp 次方）。0=个位，1=十位，-1=小数点后 1 位，-2=小数点后 2 位，以此类推。
 *   传 `undefined` 或 `null` 或 `0` 时退化为原生 `Math[type]`。
 * @returns 调整后的数值；若 value 为 NaN 或 exp 不是整数则返回 `NaN`
 *
 * @see https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Math/round#小数舍入
 */
export const decimalAdjust = (
  type: 'round' | 'ceil' | 'floor',
  value: number,
  exp?: number,
): number => {
  let _value: number = value;
  let _exp = exp;
  // 未传 exp 或 exp 为 0 / null 时直接使用原生 Math 方法
  if (_exp == null || +_exp === 0) {
    return Math[type](_value);
  }
  _value = +_value;
  _exp = +_exp;
  if (Number.isNaN(_value) || !(typeof _exp === _typeNum && _exp % 1 === 0)) {
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

/**
 * 四舍五入到指定精度
 *
 * `round10(v, -2)` 等价于 `Math.round(v * 100) / 100`，但避免浮点精度问题。
 *
 * @param value — 要舍入的数值
 * @param exp — 指数（同 {@link decimalAdjust}），默认不传即 `Math.round`
 * @returns 舍入后的值
 */
export const round10 = (value: number, exp?: number): number =>
  decimalAdjust('round', value, exp);

/**
 * 向下取整到指定精度
 *
 * @param value — 要取整的数值
 * @param exp — 指数（同 {@link decimalAdjust}）
 * @returns 取整后的值
 */
export const floor10 = (value: number, exp?: number): number =>
  decimalAdjust('floor', value, exp);

/**
 * 向上取整到指定精度
 *
 * @param value — 要取整的数值
 * @param exp — 指数（同 {@link decimalAdjust}）
 * @returns 取整后的值
 */
export const ceil10 = (value: number, exp?: number): number =>
  decimalAdjust('ceil', value, exp);

/**
 * 计算进度比例（0 ~ 1）
 *
 * **异常**：`total` 为 0、NaN、Infinity 时抛出 `Error`。
 * `value` 为 NaN / Infinity 时**静默返回 0**（由 `toNumber` 链兜底）。
 * 注意这种不对称处理——分母有严格校验，分子宽容静默。
 *
 * @param value — 当前值（分子）
 * @param total — 总值（分母）
 * @returns 进度比例，四舍五入到小数点后 2 位，钳制在 [0, 1]
 * @throws {Error} 当 `total === 0` 或 `!isNumber(total)` 时
 *
 * @example
 * ```ts
 * calcProgress(50, 100);   // 0.5
 * calcProgress(0, 100);    // 0
 * calcProgress(150, 100);  // 1（被钳制）
 * calcProgress(50, 0);     // 抛 Error
 * ```
 */
export const calcProgress = (value: number, total: number) => {
  if (total === 0 || !isNumber(total)) {
    throw new Error(_errDenominatorZero);
  }
  return limitNumberMinMax(round10(value / total, -2), 0, 1);
};
