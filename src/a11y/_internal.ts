import type { AriaIdListKey } from './aria.generated';
import type {
  A11yLintOverrides,
  A11yLintName,
  A11yLints,
  A11yOptions,
  A11yProfile,
} from './types';

/**
 * a11y 模块的内部实现细节：idlist 运行时表，以及 `createA11y` 调用点的
 * 类型检查。
 *
 * 依赖方向是单向的：这里 `import type` 公开类型，公开类型不知道这个文件
 * 存在。所以 `types.ts` 的 `IsUnion` / `Exact` 留在原地私有，不搬到这里，
 * 也不往 `types.ts` 反向导入——那样会绕出类型层的环。
 *
 * 入口 `index.ts` 只星号导出公开文件，本文件不在其中，等于私有。
 */

// ============================================================================
// 调用点检查
// ============================================================================

type UnknownOverrideKeys = Exclude<keyof A11yLintOverrides, A11yLintName>;

/**
 * 同一类型判定：互相可赋值才算同一。
 *
 * 用来判断「登记的覆盖表有没有真正生效」——`CheckOverride` 对 union
 * 值会退回内置表（union 会让 `Rule<P, R>` 分布式取表，supported 变并集），
 * 生效表与登记值不再相等。比单独再判一次 union 少一处重复逻辑：
 * 判定标准只有 `A11yLints` 这一个来源。
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * 没生效的登记键：值不是 A11yProfile，或是 union 被退回了内置表。
 * 两种都用同一条错误信息在 createA11y 调用点报错。
 */
type BadShapeKeys = {
  [K in keyof A11yLintOverrides]: K extends A11yLintName
    ? A11yLintOverrides[K] extends A11yProfile
      ? Same<A11yLints[K], A11yLintOverrides[K]> extends true
        ? never
        : K
      : K
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
 * 「没有任何必填的表」）：所有 aria 键都映射成 never，每个带 aria 属性
 * 的 a11y() 调用都报错——没有静默漏网，只是错误散落在每个调用点上且
 * 不可读（"not assignable to never"）。这个检查把错误前移到 createA11y
 * 调用点，换成一条可读的消息。判据是选中的字面量类型可赋给 `readonly []`
 * （空元组）或 `readonly never[]`（never 数组同样归约成 never 表）：
 * `A11yLintName[]` / `readonly A11yLintName[]` 变量两个都不可赋，不受影响。
 * 和 OverrideKeyCheck 同一机制，挂到 createA11y 参数上在调用点报错。
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
 * 在 createA11y 调用点报错，不静默退回默认值。机制同 `types.ts` 的
 * `Exact` 拦拼错属性。
 */
export type OptionsKeyCheck<Opt extends A11yOptions> = {
  [K in Exclude<keyof Opt, 'lint' | 'output'>]: never;
};

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
 * 导出只为让 noUnusedLocals 认可这条声明；本文件不参与入口，不会进公共 API。
 */
export type IdListInSync = Assert<
  Eq<(typeof IDLIST_KEYS)[number], AriaIdListKey>
>;
