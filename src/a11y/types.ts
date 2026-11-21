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
    readonly lint: string;
    readonly version: string;
    readonly source: 'builtin' | 'probe' | 'merged';
    /** 这张表直接沿用另一个 lint 的表（bun 表 aliasOf eslint） */
    readonly aliasOf?: string;
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

export type ResolveProfile<L> = L extends A11yLintName
  ? A11yLints[L]
  : L extends readonly A11yLintName[]
    ? MergeProfiles<A11yLints[L[number]]>
    : never;

// ---- 输入 ----

type Rule<P extends A11yProfile, R extends A11yRole> = P['roles'][R];

type NameRequirement<N> = N extends 'required'
  ? { label: string } | { labelledBy: string | readonly string[] }
  : {};

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

type AriaAttrs<I, O extends A11yOutputMode> = {
  readonly [K in keyof I as K extends string
    ? undefined extends I[K]
      ? never
      : `aria-${Lowercase<K>}`
    : never]: OutValue<I[K], O>;
} & {
  readonly [K in keyof I as K extends string
    ? undefined extends I[K]
      ? [I[K]] extends [undefined]
        ? never
        : `aria-${Lowercase<K>}`
      : never
    : never]?: OutValue<Exclude<I[K], undefined>, O>;
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
    : {}
  : {};

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
      FocusRequirement<P, R, I>,
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

export type A11yOf<Opt extends A11yOptions> = A11y<
  AsProfile<ResolveProfile<Opt['lint']>>,
  OutputOf<Opt>
>;
