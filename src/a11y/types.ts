import type {
  A11yNameRule,
  A11yRole,
  AriaIdListKey,
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
    /** 这张表直接沿用另一个 lint 的表（保留字段；当前四张内置表均独立探测生成） */
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

/**
 * 有重载且结构对（单张表），用重载；否则用内置表。
 * 形状判定不分布（`[O] extends [A11yProfile]`）：union 值分布判定会
 * 保留 union 表，Rule 对 union 取表时 supported 变并集，只有单侧
 * 支持的属性静默通过（lint 名 union 漏洞的同型，§12.6）。union 值
 * 由 BadShapeKeys 在 createA11y 调用点报错，这里退回内置表——直接
 * 构造 A11yOf 绕过那道检查也不放宽。
 */
type CheckOverride<K extends A11yLintName> =
  A11yLintOverrides extends Record<K, infer O>
    ? [O] extends [A11yProfile]
      ? IsUnion<O> extends true
        ? A11yBuiltinLints[K]
        : O
      : A11yBuiltinLints[K]
    : A11yBuiltinLints[K];

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
 * 数组（含单元素数组）同样走 MergeProfiles（§4：传数组就是合并）：
 * 约束结果和单表一致，只有 meta.source 变 'merged'。
 *
 * 分布检查走牺牲参数 _D：条件类型分布时会按成员替换 _D，但 L 不被替换，
 * 名字分支里 IsUnion<L> 看到的仍是完整 union。数组与否走牺牲参数 _Orig
 * （展平前的原始 L）：单元素数组被 FlattenLint 展平成单个名字，
 * IsUnion<L> 是 false，只有 _Orig 还认得出它是数组——round 4 删掉的
 * 数组分支因此不可达，本分支是它在可达位置的等价恢复。顶层保持分布式
 * 条件类型的原因：A11yOf 在泛型 Opt 下要靠它算出各分支的约束（非分布
 * 的 `[L] extends [...]` 会让约束退化为 unknown，A11yOf 编译不过）。
 */
type ResolveProfileImpl<L, _Orig = L, _D = L> = _D extends A11yLintName
  ? IsUnion<L> extends true
    ? MergeProfiles<L extends A11yLintName ? A11yLints[L] : never>
    : [_Orig] extends [readonly A11yLintName[]]
      ? MergeProfiles<L extends A11yLintName ? A11yLints[L] : never>
      : A11yLints[L extends A11yLintName ? L : never]
  : never;

/**
 * 混合形状（`'biome' | readonly ['oxlint']`，条件表达式推出来的类型）先
 * 展平成名字并集：不展平就直接分布，名字和数组两个成员各走各的分支，
 * 得到两张表的并集（supported 变并集，fail-open）；展平后统一走名字
 * 并集的合并（supported 取交集）。
 */
type FlattenLint<L> = L extends readonly A11yLintName[] ? L[number] : L;

export type ResolveProfile<L> = ResolveProfileImpl<FlattenLint<L>, L>;

// ---- 输入 ----

type Rule<P extends A11yProfile, R extends A11yRole> = P['roles'][R];

type NameRequirement<N> = N extends 'required'
  ? { label: string } | { labelledby: string | readonly string[] }
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
 * 两道门：`'focusable' extends keyof I`（键存在）先于 `true extends
 * I['focusable']`（值含 true）。键存在不能用形状匹配（`I extends {
 * focusable: unknown }`）：条件展开 `...(cond ? { focusable: true } : {})`
 * 推出的是可选键 `focusable?: true`，形状匹配判不中，额外必填整个漏掉
 * （§3 宁可多要求）。值判定用「含 true」而不是 `I extends { focusable:
 * true }`：`true | undefined` 变量也要打开额外必填。
 *
 * 这里的三段式和 EmptyValueScope / FocusAttr 里的重复是有意的，不要抽成
 * 共享谓词：三处的输出形状不同（必填键映射 / 键集合 / tabIndex 键）。
 * 外层条件的被检类型是字面量 'focusable'，不对 I 分布——union 的 props
 * 由 PropsDefiniteCheck 在调用点拦下；按成员分布反而会把「某成员的要求、
 * 其余成员的 unknown」并起来吸收成 unknown，逐成员的强制全部落空
 * （round 12 修复，见设计稿 §12.8）。
 */
type FocusRequirement<
  P extends A11yProfile,
  R extends A11yRole,
  I,
> = 'focusable' extends keyof I
  ? true extends I['focusable']
    ? { [K in Rule<P, R>['requiredWhenFocusable']]-?: AriaValue<K> }
    : unknown
  : unknown;

/**
 * 空值拦截要查的键集合：required，加上 focusable 激活时（激活判定
 * 与 FocusRequirement 同源：键在 I 里、值含 true 就算，可选键和
 * true | undefined 变量也打开）的 requiredWhenFocusable——两组必填
 * 同一条承诺，只拦一组会漏。
 */
type EmptyValueScope<P extends A11yProfile, R extends A11yRole, I> =
  | Rule<P, R>['required']
  | ('focusable' extends keyof I
      ? true extends I['focusable']
        ? Rule<P, R>['requiredWhenFocusable']
        : never
      : never);

/**
 * 全空 idlist 数组的判定模式：元素类型恰为 '' 的只读字符串数组才可赋给
 * `readonly ''[]`——空元组（vacuously）、['']、['',''] 都匹配，join 出的
 * 值 trim 后为空，运行时按「没传」跳过；混入非空成员的 ['', 'a'] 和
 * `string[]` 变量不匹配（非字面量认不出，NoEmpty 已记录的限制）。
 *
 * WHY 纯空白成员（[' ']）匹配不上：' ' 不是 ''，类型层只能按字面量判，
 * 放行；运行时 join 后 trim 判空、按「没传」跳过，两边会漂。类型层没有
 * 「trim 后为空」的判定可用，不在类型层追——已记录的限制（设计 §12.15），
 * 不是漏拦。
 */
type AllEmptyIds = readonly ''[];

/**
 * 键集合里实际触发空值拦截的键名。键不在 I 里（没传）不触发：缺失键
 * 由 A11yInput / FocusRequirement 报错，这里不叠加。只查运行时真会跳过
 * 空值的键（label / idlist，见 NoEmpty）：其余键的 '' 原样输出，
 * 必填承诺不因空串落空，不该拦。
 */
type EmptyValueKeys<Keys extends PropertyKey, I> = {
  [K in Keys]: [K] extends [keyof I]
    ? [K] extends ['label' | AriaIdListKey]
      ? Extract<I[K], AllEmptyIds | ''> extends never
        ? never
        : K
      : never
    : never;
}[Keys];

/**
 * 必填键的空值拦截：`controls: []`、`controls: ['']`、`controls: ''` 满足
 * AriaValue，但 NoEmpty 会把输出键归一成 undefined 丢掉，「输出过选中的
 * 表」的承诺落空。
 * 值是含空值的 union（`readonly [] | readonly ['a']`、`'' | 'm'`）也拦
 * （round 13 起：Extract 分布取出空值成员判，非分布的 `I[K] extends ...`
 * 对 union 判不中）；非字面量（string / string[] 变量持有 '' / []）类型层
 * 认不出，是 NoEmpty 已记录的同一限制。
 *
 * 报错形状：触发键名编码进 message 属性的值（同 OverrideKeyCheck 的做法）。
 * 不要改回「把触发键映射成 never」：tsc 会把 props 里每个键都报成
 * not assignable to never（实测），看不出哪个键触发。
 */
type NoEmptyRequired<P extends A11yProfile, R extends A11yRole, I> = [
  EmptyValueKeys<EmptyValueScope<P, R, I>, I>,
] extends [never]
  ? unknown
  : {
      readonly 'required idlist keys must not be empty': EmptyValueKeys<
        EmptyValueScope<P, R, I>,
        I
      >;
    };

/**
 * 名字必填的 role，label / labelledby 传字面量空值在调用点报错：空值
 * 运行时按「没传」跳过（NoEmpty 同源），对名字必填的 role 等于没给
 * 名字，§4 的「label / labelledby 至少一个」落空。空值集：label 的
 * `'' | undefined`（undefined 也是提供了的名字键，round 2 起计入，
 * `string | undefined` 变量同拦——fail-closed）、labelledby 的
 * `'' | undefined | AllEmptyIds`（空元组 / 全空串成员数组）。值是含空值
 * 的 union 也拦（round 13 起：分布判会把错误对象和 unknown 并起来吸收成
 * unknown）；另一边给了非空名时不拦：空的这边只是死键，NoEmpty 丢掉它
 * 不算失约；非字面量（string / string[] 变量持有 '' / []）认不出，是
 * NoEmpty 已记录的同一限制。
 */
type NameEmptyCheck<N, I> = N extends 'required'
  ? I extends { label: infer L }
    ? Extract<L, '' | undefined> extends never
      ? unknown
      : I extends { labelledby: infer V }
        ? Extract<V, '' | undefined | AllEmptyIds> extends never
          ? unknown
          : { readonly 'accessible name must not be empty': L | V }
        : { readonly 'accessible name must not be empty': L }
    : I extends { labelledby: infer V }
      ? Extract<V, '' | undefined | AllEmptyIds> extends never
        ? unknown
        : { readonly 'accessible name must not be empty': V }
      : unknown
  : unknown;

/**
 * role 单字面量检查：`Rule<P, R>` 对 role 并集分布式取表，supported 变成
 * 各 role 的并集，只有部分 role 支持的属性会静默通过；`A11yNameRule[R]`
 * 变成 'required' | 'optional'，NameRequirement 分布出一个 Record<never,
 * never> 分支，名字必填被空对象满足（lint 名 union 漏洞的镜像）。不取
 * 交集：一个 role 的必填可能不在另一个的 supported 里（switch 必填
 * checked、img 的 supported 不含 checked），交集会把合法组合变成不可
 * 满足。宁可在调用点报错，让调用方收窄成单个 role。
 */
type RoleDefiniteCheck<R extends A11yRole> =
  IsUnion<R> extends true
    ? { readonly 'role must be a single literal, not a union': R }
    : unknown;

/**
 * props 是 union 时在调用点报错（机制同 RoleDefiniteCheck）：条件表达式
 * 直接当 props 传（`cond ? { focusable: true } : { label: 'x' }`）时，
 * 对 I 分布的检查把「某成员的要求」和其余成员的 unknown 并起来——
 * `{ valuenow } | unknown` 吸收成 unknown，逐成员的强制全部失效
 * （focusable 的额外必填、名字必填都静默漏过）；键存在门对 union 取
 * 公共键，同样判不出。让调用方把分支写进对象（条件展开推可选键）或
 * 拆成两次调用。
 */
type PropsDefiniteCheck<I> =
  IsUnion<I> extends true
    ? { readonly 'props must not be a union type; branch the call': I }
    : unknown;

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
 * 空值按「没传」处理：空 idlist 数组 join 出 '' 不是合法 id 列表，label /
 * idlist 键的空串同样不是合法输出，运行时跳过这些空值。类型层把字面量
 * 空元组、全空串成员的 idlist 数组（['']、['','']，见 AllEmptyIds）、以及
 * label / idlist 键的字面量空串归一成 undefined，输出键和 undefined 一样
 * 消失或变可选，两边不漂。
 *
 * 已知限制：非字面量类型认不出空值——string / string[] 变量持有 '' / []
 * 时，类型层仍承诺输出键，运行时却跳过它；必填的键同理。只有字面量空值
 * 能在两层间对齐（见 createA11y.ts 的运行时跳过）。纯空白字面量同理：
 * ' ' 不是 ''，[' '] 这类数组在类型层认不出，运行时 join 后 trim 判空
 * 跳过——同一限制（设计 §12.15），不是 bug，不在类型层追。
 */
type NoEmpty<K extends PropertyKey, V> = [K] extends ['label' | AriaIdListKey]
  ? V extends '' | AllEmptyIds
    ? undefined
    : V
  : V;

type AriaAttrs<I, O extends A11yOutputMode> = {
  readonly [K in keyof I as K extends string
    ? undefined extends NoEmpty<K, I[K]>
      ? never
      : `aria-${Lowercase<K>}`
    : never]: OutValue<NoEmpty<K, I[K]>, O>;
} & {
  readonly [K in keyof I as K extends string
    ? undefined extends NoEmpty<K, I[K]>
      ? [NoEmpty<K, I[K]>] extends [undefined]
        ? never
        : `aria-${Lowercase<K>}`
      : never
    : never]?: OutValue<Exclude<NoEmpty<K, I[K]>, undefined>, O>;
};

type TabKey<O extends A11yOutputMode> = O extends 'html'
  ? 'tabindex'
  : 'tabIndex';

type TabVal<O extends A11yOutputMode> = O extends 'html' ? '0' : 0;

type FocusAttr<I, O extends A11yOutputMode> = 'focusable' extends keyof I
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
      NoEmptyRequired<P, R, I> &
      NameEmptyCheck<A11yNameRule[R], I> &
      RoleDefiniteCheck<R> &
      PropsDefiniteCheck<I>,
  ): A11yAttrs<R, I, O>;
  // aria 也拦 union props（同 a11y(role, props) 挂 PropsDefiniteCheck）：
  // AriaAttrs 对 union 分布成各分支输出的并集，keyof 取公共键是 never，
  // 一个键都读不出来，运行时却发其中一个分支的属性（§12.9）。
  aria<const I extends { [K in AriaKey]?: AriaValue<K> | undefined }>(
    props: I & Exact<I, AriaKey> & PropsDefiniteCheck<I>,
  ): AriaAttrs<I, O>;
};

// ---- 选项解析 ----

/** output 没写时取 'react' */
type OutputOf<Opt extends A11yOptions> = Opt['output'] extends A11yOutputMode
  ? Opt['output']
  : 'react';

type AsProfile<P> = P extends A11yProfile ? P : never;

/**
 * 已知限制：挂在 createA11y 参数上的调用点检查（OverrideKeyCheck、
 * LintSelectionCheck、OptionsKeyCheck、OutputDefiniteCheck）只拦
 * createA11y 这个正式入口；直接构造 `A11yOf` 会整体绕过这层检查。
 * 真正的绕过危险在 output 维度：`A11yOf<{ lint: 'biome'; output:
 * A11yOutputMode }>` 绕过 OutputDefiniteCheck 后，TabKey 对双模式
 * union 分布，输出类型同时要求 tabIndex 和 tabindex 两个键（值都推成
 * `0 | '0'`），运行时只发一个。lint 维度没有静默漏网：`A11yOf<{
 * lint: [] }>` 归约成 never 表，带 aria 属性的调用在各自调用点报错
 * （见 LintSelectionCheck），只是错误不可读；union 值的重载在
 * CheckOverride 内部退回内置表，supported 不会变并集。类型层的
 * 保证以走 createA11y 为前提。
 */
export type A11yOf<Opt extends A11yOptions> = A11y<
  AsProfile<ResolveProfile<Opt['lint']>>,
  OutputOf<Opt>
>;
