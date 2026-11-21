import type {
  A11yNameRule,
  A11yRole,
  AriaKey,
  AriaValue,
} from './aria.generated';
import type { A11yBuiltinLints } from './lints';

/**
 * 单个 role 的一张规则条目：
 * 必填 / 允许（含必填，已减去禁止属性）/ 可聚焦时额外必填。
 */
export type A11yRoleRule = {
  readonly required: AriaKey;
  readonly supported: AriaKey;
  readonly requiredWhenFocusable: AriaKey;
};

/** 一张 lint 规则表：某个 lint、某个版本下的规则。由探针生成，不手写。 */
export type A11yProfile = {
  readonly meta: {
    readonly lint: A11yLintName;
    readonly version: string;
    readonly source: 'builtin' | 'probe' | 'merged';
    /** 这张表直接沿用另一个 lint 的表（bun 表 aliasOf eslint） */
    readonly aliasOf?: A11yLintName;
  };
  readonly roles: { readonly [R in A11yRole]: A11yRoleRule };
};

/** 生效的 lint 名字（内置表的键）。 */
export type A11yLintName = keyof A11yBuiltinLints;

/** 输出模式：值的形式，react 原样 / html 字符串化 */
export type A11yOutputMode = 'react' | 'html';

/** createA11y 的选项 */
export type A11yOptions = {
  readonly lint: A11yLintName | readonly A11yLintName[];
  readonly output?: A11yOutputMode;
};

/**
 * 使用方重载入口。core 里永远是空的；
 * 用户项目里由探针生成的文件往这里登记。
 */
// biome-ignore lint/suspicious/noEmptyInterface: 留给使用方用 declaration merging 重载
export interface A11yLintOverrides {}

/** 有重载且结构对，用重载；否则用内置表 */
type CheckOverride<K extends A11yLintName> =
  A11yLintOverrides extends Record<K, infer O>
    ? O extends A11yProfile
      ? O
      : A11yBuiltinLints[K]
    : A11yBuiltinLints[K];

type UnknownOverrideKeys = Exclude<keyof A11yLintOverrides, A11yLintName>;

type BadShapeKeys = {
  [K in keyof A11yLintOverrides]: A11yLintOverrides[K] extends A11yProfile
    ? never
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
        readonly 'Invalid A11yLintOverrides shape, rerun meld a11y probe': BadShapeKeys;
      });

/**
 * 空 lint 表检查：lint 传空数组字面量时，合并退化为一张没有任何必填的
 * 表，部分调用静默通过（设计 §4 的不变量禁止）。判据是选中的字面量类型
 * 可赋给 `readonly []`（空元组）或 `readonly never[]`（never 数组同样
 * 退化成空表）：`A11yLintName[]` / `readonly A11yLintName[]` 变量两个
 * 都不可赋，不受影响。和 OverrideKeyCheck 同一机制，挂到 createA11y
 * 参数上在调用点报错。
 */
export type LintSelectionCheck<Opt extends A11yOptions> = [
  Opt['lint'],
] extends [readonly [] | readonly never[]]
  ? { readonly 'lint array must not be empty': Opt['lint'] }
  : unknown;

/**
 * 选项键检查：lint / output 之外的键（拼错的 outpt 之类）映射成 never，
 * 在 createA11y 调用点报错，不静默退回默认值。机制同 Exact 拦拼错属性。
 */
export type OptionsKeyCheck<Opt extends A11yOptions> = Exact<
  Opt,
  'lint' | 'output'
>;

/** 实际生效的表：有重载、且结构对，用重载；否则用内置 */
export type A11yLints = { [K in A11yLintName]: CheckOverride<K> };

// ---- 多 lint 合并 ----

type UnionToIntersection<U> = (
  U extends unknown
    ? (x: U) => void
    : never
) extends (x: infer I) => void
  ? I
  : never;

type Intersect<Ps extends A11yProfile, R extends A11yRole> = Extract<
  AriaKey,
  UnionToIntersection<
    Ps extends unknown ? (k: Ps['roles'][R]['supported']) => void : never
  > extends infer F
    ? F extends (k: infer K) => void
      ? K
      : never
    : never
>;

/**
 * 合并多张规则表：
 * - required 取并集（每个 lint 都要求 → 合并后都要求）
 * - supported 取交集（每个 lint 都允许 → 合并后才允许）
 * - requiredWhenFocusable 取并集
 */
export type MergeProfiles<Ps extends A11yProfile> = {
  meta: {
    lint: Ps['meta']['lint'];
    version: Ps['meta']['version'];
    source: 'merged';
  };
  roles: {
    [R in A11yRole]: {
      required: Ps['roles'][R]['required'];
      supported: Intersect<Ps, R>;
      requiredWhenFocusable: Ps['roles'][R]['requiredWhenFocusable'];
    };
  };
};

/**
 * 非分布的 union 判定：lint 是变量 / 条件表达式（类型为几个名字的 union）
 * 时为 true。分布写法会对 union 的每个成员各判一次，永远得到 false。
 */
type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;

/**
 * lint 名是 union 时必须走 MergeProfiles（supported 取交集）：
 * 分布式条件类型会把 union 拆成几张表的并集，supported 变成并集，
 * 只有部分 lint 支持的属性会静默通过，违反「按项目的 lint 分表」。
 *
 * 分布检查走牺牲参数 _D：条件类型分布时会按成员替换 _D，但 L 不被替换，
 * 名字分支里 IsUnion<L> 看到的仍是完整 union。顶层保持分布式条件类型的
 * 原因：A11yOf 在泛型 Opt 下要靠它算出各分支的约束（非分布的
 * `[L] extends [...]` 会让约束退化为 unknown，A11yOf 编译不过）。
 */
type ResolveProfileImpl<L, _D = L> = _D extends A11yLintName
  ? IsUnion<L> extends true
    ? MergeProfiles<L extends A11yLintName ? A11yLints[L] : never>
    : A11yLints[L extends A11yLintName ? L : never]
  : L extends readonly A11yLintName[]
    ? MergeProfiles<A11yLints[L[number]]>
    : never;

/**
 * 混合形状（`'biome' | readonly ['oxlint']`，条件表达式推出来的类型）先
 * 展平成名字并集：不展平就直接分布，名字和数组两个成员各走各的分支，
 * 得到两张表的并集（supported 变并集，fail-open）；展平后统一走名字
 * 并集的合并（supported 取交集）。
 */
type FlattenLint<L> = L extends readonly A11yLintName[] ? L[number] : L;

export type ResolveProfile<L> = ResolveProfileImpl<FlattenLint<L>>;

// ---- 输入 ----

type Rule<P extends A11yProfile, R extends A11yRole> = P['roles'][R];

type NameRequirement<N> = N extends 'required'
  ? { label: string } | { labelledBy: string | readonly string[] }
  : Record<never, never>;

export type A11yInput<P extends A11yProfile, R extends A11yRole> = {
  [K in Rule<P, R>['required']]-?: AriaValue<K>;
} & {
  [K in Exclude<Rule<P, R>['supported'], Rule<P, R>['required']>]?:
    | AriaValue<K>
    | undefined;
} & { focusable?: true | undefined } & NameRequirement<A11yNameRule[R]>;

/**
 * 多余键检查：I 是推导出的泛型，TypeScript 对它不做多余属性检查，
 * 必须显式把允许集合外的键映射成 never。
 */
type Exact<I, Allowed extends PropertyKey> = {
  [K in Exclude<keyof I, Allowed>]: never;
};

/**
 * 可聚焦时的额外必填。
 * 条件必须是 `true extends I['focusable']`：变量类型含 true（如
 * true | undefined）也要打开额外必填。用 `I extends { focusable: true }`
 * 会判不中含 undefined 的变量。
 */
type FocusRequirement<
  P extends A11yProfile,
  R extends A11yRole,
  I,
> = I extends { focusable: unknown }
  ? true extends I['focusable']
    ? { [K in Rule<P, R>['requiredWhenFocusable']]-?: AriaValue<K> }
    : unknown
  : unknown;

/**
 * 必填键的空元组拦截：`controls: []` 满足 AriaValue，但 NoEmpty 会把
 * 输出键归一成 undefined 丢掉，「输出过选中的表」的承诺落空。只拦得到
 * 字面量空元组；非元组（string[] 变量持有 []）类型层认不出，是 NoEmpty
 * 已记录的同一限制。成员可选：键缺失时（A11yInput 已报错）不叠加错误。
 */
type NoEmptyRequired<P extends A11yProfile, R extends A11yRole, I> = {
  [K in Rule<P, R>['required']]?: I[K & keyof I] extends readonly []
    ? never
    : unknown;
};

// ---- 输出 ----

type Str<V> = V extends readonly string[]
  ? string
  : V extends boolean | number
    ? `${V}`
    : V;

type OutValue<V, O extends A11yOutputMode> = V extends readonly string[]
  ? string
  : O extends 'html'
    ? Str<V>
    : V;

/**
 * 空 idlist 数组按「没传」处理：join 出的 '' 不是合法 id 列表，运行时
 * 跳过空数组。类型层把空元组归一成 undefined，输出键和 undefined 一样
 * 消失或变可选，两边不漂。
 *
 * 已知限制：非元组类型认不出空数组——`string[]` 变量持有 `[]` 时，类型层
 * 仍承诺输出键，运行时却跳过它；必填的 idlist 键同理。只有字面量空元组
 * 能在两层间对齐（见 createA11y.ts 的运行时跳过）。
 */
type NoEmpty<V> = V extends readonly [] ? undefined : V;

type AriaAttrs<I, O extends A11yOutputMode> = {
  readonly [K in keyof I as K extends string
    ? undefined extends NoEmpty<I[K]>
      ? never
      : `aria-${Lowercase<K>}`
    : never]: OutValue<NoEmpty<I[K]>, O>;
} & {
  readonly [K in keyof I as K extends string
    ? undefined extends NoEmpty<I[K]>
      ? [NoEmpty<I[K]>] extends [undefined]
        ? never
        : `aria-${Lowercase<K>}`
      : never
    : never]?: OutValue<Exclude<NoEmpty<I[K]>, undefined>, O>;
};

type TabKey<O extends A11yOutputMode> = O extends 'html'
  ? 'tabindex'
  : 'tabIndex';

type TabVal<O extends A11yOutputMode> = O extends 'html' ? '0' : 0;

type FocusAttr<I, O extends A11yOutputMode> = I extends {
  focusable: unknown;
}
  ? true extends I['focusable']
    ? undefined extends I['focusable']
      ? { readonly [K in TabKey<O>]?: TabVal<O> }
      : { readonly [K in TabKey<O>]: TabVal<O> }
    : Record<never, never>
  : Record<never, never>;

export type A11yAttrs<R, I, O extends A11yOutputMode> = {
  readonly role: R;
} & FocusAttr<I, O> &
  AriaAttrs<Omit<I, 'focusable'>, O>;

/**
 * a11y 可调用对象：
 * - a11y(role, props)：按 role 约束输入，输出精确属性
 * - a11y.aria(props)：原生元素补状态，不带 role
 */
export type A11y<P extends A11yProfile, O extends A11yOutputMode> = {
  <R extends A11yRole, const I extends A11yInput<P, R>>(
    role: R,
    props: I &
      Exact<I, Rule<P, R>['supported'] | 'focusable'> &
      FocusRequirement<P, R, I> &
      NoEmptyRequired<P, R, I>,
  ): A11yAttrs<R, I, O>;
  aria<const I extends { [K in AriaKey]?: AriaValue<K> | undefined }>(
    props: I & Exact<I, AriaKey>,
  ): AriaAttrs<I, O>;
};

// ---- 选项解析 ----

/** output 没写时取 'react' */
type OutputOf<Opt extends A11yOptions> = Opt['output'] extends A11yOutputMode
  ? Opt['output']
  : 'react';

type AsProfile<P> = P extends A11yProfile ? P : never;

/**
 * 已知限制：直接构造 `A11yOf<{ lint: [] }>`（或 never[]）会绕过
 * LintSelectionCheck——它只挂在 createA11y 的参数上，正式入口被拦，
 * 直接构造 A11yOf 不经过这层检查，得到一张没有必填的退化表。
 */
export type A11yOf<Opt extends A11yOptions> = A11y<
  AsProfile<ResolveProfile<Opt['lint']>>,
  OutputOf<Opt>
>;
