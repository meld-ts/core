import type { AriaIdListKey } from './aria.generated';
import type {
  A11yLintOverrides,
  A11yLintName,
  A11yOptions,
  A11yProfile,
} from './types';

/**
 * a11y 模块的内部实现细节。
 *
 * 不在 `@meld-ts/core/a11y` 的入口里：`index.ts` 只做星号导出
 * （`export * from './types'` 之类），这里不被任何一份入口文件
 * 星号带上，所以放在这个文件就等于「私有」。要新增内部符号，
 * 放这里或同目录其它 `_` 开头的文件，不要去入口里逐个列举。
 */

// ============================================================================
// 类型工具
// ============================================================================

/**
 * 非分布的 union 判定：lint 是变量 / 条件表达式（类型为几个名字的 union）
 * 时为 true。分布写法会对 union 的每个成员各判一次，永远得到 false。
 */
export type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;

/**
 * 多余键检查：I 是推导出的泛型，TypeScript 对它不做多余属性检查，
 * 必须显式把允许集合外的键映射成 never。
 */
export type Exact<I, Allowed extends PropertyKey> = {
  [K in Exclude<keyof I, Allowed>]: never;
};

// ============================================================================
// createA11y 调用点的检查
// ============================================================================

type UnknownOverrideKeys = Exclude<keyof A11yLintOverrides, A11yLintName>;

/**
 * 结构不对的键：值不是 A11yProfile，或是 union——探针只生成单张表，
 * union 值会让 Rule<P, R> 对 union 分布式取表，supported 变并集，
 * 只有单侧支持的属性静默通过（lint 名 union 漏洞的同型），两种都算
 * 结构不对，用同一条错误信息在 createA11y 调用点报错。
 */
type BadShapeKeys = {
  [K in keyof A11yLintOverrides]: A11yLintOverrides[K] extends A11yProfile
    ? IsUnion<A11yLintOverrides[K]> extends true
      ? K
      : never
    : K;
}[keyof A11yLintOverrides];

/**
 * 重载写错的检查：挂到 createA11y 参数上，
 * 错误信息用英文（中文属性名在 tsc 报错里会被转成 \uXXXX）。
 */
export type OverrideKeyCheck = ([UnknownOverrideKeys] extends [never]
  ? unknown
  : {
      readonly 'Unknown lint name in A11yLintOverrides': UnknownOverrideKeys;
    }) &
  ([BadShapeKeys] extends [never]
    ? unknown
    : {
        readonly 'Invalid A11yLintOverrides shape, rerun meld-ts a11y probe': BadShapeKeys;
      });

/**
 * 空 lint 表检查：lint 传空数组字面量时，选择归约成 never 表（不是
 * 「没有任何必填的表」）：Exact 把所有 aria 键映射成 never，每个带
 * aria 属性的 a11y() 调用都报错——没有静默漏网，只是错误散落在每个
 * 调用点上且不可读（"not assignable to never"）。这个检查把错误前移
 * 到 createA11y 调用点，换成一条可读的消息。判据是选中的字面量类型
 * 可赋给 `readonly []`（空元组）或 `readonly never[]`（never 数组同样
 * 归约成 never 表）：`A11yLintName[]` / `readonly A11yLintName[]` 变量
 * 两个都不可赋，不受影响。和 OverrideKeyCheck 同一机制，挂到
 * createA11y 参数上在调用点报错。
 */
export type LintSelectionCheck<Opt extends A11yOptions> = [
  Opt['lint'],
] extends [readonly [] | readonly never[]]
  ? { readonly 'lint array must not be empty': Opt['lint'] }
  : unknown;

/**
 * output 单模式检查：`output` 键存在时，类型必须恰好是一个模式——
 * `'react'` 或 `'html'`（非分布判定，union 不会被拆开逐个成员判）。
 * 类型含 `undefined` 的变量、收着整个 `A11yOptions` 的非泛型包装、
 * 以及同时含两个模式的 union（`A11yOutputMode` 变量、跨模式默认值
 * `out ?? 'react'`）都拦：union 会让输出类型同时要求 `tabIndex` 和
 * `tabindex` 两个键，运行时只发一个，类型承诺和实际输出漂移。
 * 收窄成单模式后可用（out 已收窄为 `'html' | undefined` 时，
 * `out ?? 'html'` 就是 `'html'`）；键缺失不拦，走默认 react。
 * 同 OptionsKeyCheck / LintSelectionCheck 挂到 createA11y 参数上
 * 在调用点报错。
 */
export type OutputDefiniteCheck<Opt extends A11yOptions> =
  'output' extends keyof Opt
    ? [Opt['output']] extends ['react']
      ? unknown
      : [Opt['output']] extends ['html']
        ? unknown
        : {
            readonly "output must be exactly 'react' or 'html', not a union of both modes nor a type containing undefined": Opt['output'];
          }
    : unknown;

/**
 * 选项键检查：lint / output 之外的键（拼错的 outpt 之类）映射成 never，
 * 在 createA11y 调用点报错，不静默退回默认值。机制同 Exact 拦拼错属性。
 */
export type OptionsKeyCheck<Opt extends A11yOptions> = Exact<
  Opt,
  'lint' | 'output'
>;

// ============================================================================
// idlist 运行时表
// ============================================================================

/**
 * idlist 属性的运行时最小表：只有这些键的数组值用空格拼接。
 * 其余逻辑全部由类型层保证。
 */
export const IDLIST_KEYS = [
  'controls',
  'describedby',
  'flowto',
  'labelledby',
  'owns',
] as const;

export const IDLIST_SET: ReadonlySet<string> = new Set(IDLIST_KEYS);

/**
 * 运行时跳过空值的键：名字键 label，加全部 idlist 键。空串按「没传」
 * 处理；idlist 数组 join 出的值 trim 后为空（空数组、['']、['','']）与
 * 空串同一条路径（types.ts 的 NoEmpty 同源）。
 */
export const isEmptyValue = (key: string, value: unknown): boolean => {
  if (IDLIST_SET.has(key)) {
    return Array.isArray(value) ? value.join(' ').trim() === '' : value === '';
  }
  return key === 'label' && value === '';
};

// ============================================================================
// 生成数据同步断言
// ============================================================================

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

/**
 * 生成数据更新而此处忘记同步时，编译期报错。
 * 导出只为让 noUnusedLocals 认可这条声明；index.ts 用星号导出，
 * 本文件不参与入口，所以它不会进公共 API。
 */
export type IdListInSync = Assert<
  Eq<(typeof IDLIST_KEYS)[number], AriaIdListKey>
>;
