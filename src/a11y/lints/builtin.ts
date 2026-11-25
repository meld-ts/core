/**
 * 内置 lint 规则表汇总。
 *
 * 一个 lint 一个文件；更新单个 lint 整文件覆盖。
 * 四张表均由探针独立生成（bun 表不 aliasOf eslint，内嵌 oxlint 独立探测）。
 */
import type { BiomeA11yProfile } from './_biome';
import type { BunA11yProfile } from './_bun';
import type { EslintA11yProfile } from './_eslint';
import type { OxlintA11yProfile } from './_oxlint';

/**
 * core 内置的 lint 规则表；声明为 interface 以支持声明合并。
 *
 * 这是对外的唯一入口：四张具体表通过它组织（`A11yBuiltinLints['biome']`），
 * 表文件以 `_` 开头，不被入口转发，不会进公开面。
 */
export interface A11yBuiltinLints {
  eslint: EslintA11yProfile;
  bun: BunA11yProfile;
  oxlint: OxlintA11yProfile;
  biome: BiomeA11yProfile;
}
