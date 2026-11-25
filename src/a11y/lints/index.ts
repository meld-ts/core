/**
 * 内置 lint 规则表汇总。
 *
 * 一个 lint 一个文件；更新单个 lint 整文件覆盖。
 * 四张表均由探针独立生成（bun 表不 aliasOf eslint，内嵌 oxlint 独立探测）。
 */
import type { BiomeA11yProfile } from './biome';
import type { BunA11yProfile } from './bun';
import type { EslintA11yProfile } from './eslint';
import type { OxlintA11yProfile } from './oxlint';

export * from './biome';
export * from './bun';
export * from './eslint';
export * from './oxlint';

/** core 内置的 lint 规则表；声明为 interface 以支持声明合并。 */
export interface A11yBuiltinLints {
  eslint: EslintA11yProfile;
  bun: BunA11yProfile;
  oxlint: OxlintA11yProfile;
  biome: BiomeA11yProfile;
}
