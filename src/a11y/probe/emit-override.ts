/**
 * 用户模式生成文件：往 `A11yLintOverrides` 里 declaration merging
 * 写入探测到的表。首行固定 `export {};`——没有顶层 import/export 的
 * 文件是脚本文件，`declare module` 会整个替换目标模块而不是合并，
 * 子路径导出会被盖掉（设计 §4）。
 */

import type { ProfileData } from './serialize';
import { serializeProfileLiteral } from './serialize';

// 字面量嵌进 interface 条目后整体缩进 4 格；首行拼在 `lint: ` 之后。
const entryOf = (lint: string, profile: ProfileData): string =>
  `    ${lint}: ${serializeProfileLiteral(profile, 'probe')
    .split('\n')
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join('\n')};`;

export const serializeOverride = (
  profiles: Readonly<Record<string, ProfileData>>,
): string =>
  `export {};
/**
 * meld-ts a11y probe 生成的 lint 规则表重载。
 *
 * 生成文件，勿手改。lint 版本变化后重跑 meld-ts a11y probe 重新生成。
 */
declare module '@meld-ts/core/a11y' {
  interface A11yLintOverrides {
${Object.entries(profiles)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([lint, profile]) => entryOf(lint, profile))
  .join('\n')}
  }
}
`;
