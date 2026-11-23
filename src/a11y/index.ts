/**
 * a11y 子路径入口：类型机器 + createA11y 运行时。
 *
 * 不导出任何预绑定的 a11y 实例；使用方在项目里用 createA11y
 * 绑定自己的 lint 与 output。
 */
/** biome-ignore-all assist/source/organizeImports: 手动维护导出排序 */
export type {
  A11yNameRule,
  A11yRole,
  AriaIdKey,
  AriaIdListKey,
  AriaKey,
  AriaValue,
} from './aria.generated';
export type {
  A11yBuiltinLints,
  BiomeA11yProfile,
  OxlintA11yProfile,
} from './lints';
export type { A11yLintName, A11yProfile, A11yRoleRule } from './types';
export { createA11y } from './createA11y';
export type {
  A11yLintOverrides,
  A11yLints,
  A11yOptions,
  A11yOutputMode,
  OverrideKeyCheck,
} from './types';
export type {
  A11y,
  A11yAttrs,
  A11yInput,
  A11yOf,
  MergeProfiles,
  ResolveProfile,
} from './types';
