/**
 * 内置 lint 规则表汇总。
 *
 * 一个 lint 一个文件；更新单个 lint 整文件覆盖。
 * eslint / bun 两张表 Plan B 补齐（bun 表 aliasOf eslint）。
 */
import type { BiomeA11yProfile } from './biome';
import type { OxlintA11yProfile } from './oxlint';

export type { BiomeA11yProfile } from './biome';
export type { OxlintA11yProfile } from './oxlint';

/** core 内置的 lint 规则表；声明为 interface 以支持声明合并。 */
export interface A11yBuiltinLints {
  biome: BiomeA11yProfile;
  oxlint: OxlintA11yProfile;
}
