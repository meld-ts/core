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
