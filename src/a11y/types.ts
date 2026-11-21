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
