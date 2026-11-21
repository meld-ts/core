import type { A11yRole, AriaKey } from './aria.generated';
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
