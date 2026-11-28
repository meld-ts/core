/**
 * 四张内置表的 ProfileData → `profiles.generated.ts` 的源码文本。
 * 纯函数、无 IO；运行时快照只给 probe、scripts 与一致性测试用，
 * 不进 a11y 入口与 browser 产物。
 */

import type { ProfileData } from './serialize';

const SORT = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const generateProfiles = (
  profiles: Readonly<Record<string, ProfileData>>,
): string => {
  // 每个 profile 一整段 JSON.stringify：一行一 lint，可逐行 JSON.parse 回读。
  const rows = Object.entries(profiles)
    .sort(([a], [b]) => SORT(a, b))
    .map(([lint, profile]) => `  ${lint}: ${JSON.stringify(profile)},`)
    .join('\n');
  return `/**
 * 四张内置表的运行时快照。
 *
 * 生成文件，勿手改。只给 probe、scripts 与一致性测试用；不进入 a11y 入口与 browser。
 */
export const PROFILES = {
${rows}
} as const;
`;
};

/**
 * 快照合并：以现有 PROFILES 为基底，只替换本轮同步产出的 lint 键。
 * `a11y:sync --lint=biome` 只探 biome，整文件重写会把其余 lint 的键丢掉，
 * 一致性测试读 PROFILES 余键即崩；键级整表替换，不做深合并——一张表
 * 就是本轮探针的完整产出。
 */
export const mergeProfilesSnapshot = (
  existing: Readonly<Record<string, ProfileData>>,
  fresh: Readonly<Record<string, ProfileData>>,
): Record<string, ProfileData> => ({ ...existing, ...fresh });
