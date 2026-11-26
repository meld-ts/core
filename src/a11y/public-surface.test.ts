import { describe, expect, test } from 'bun:test';
import { getPublicSurface } from '../../test/public-surface';

/**
 * 公开面快照（1.0.3 之后按破坏性变更发版的收缩）：入口从 25 个名字收到 21 个——
 * BiomeA11yProfile / BunA11yProfile / EslintA11yProfile / OxlintA11yProfile
 * 四张表不再从入口导出，取法改为 `A11yBuiltinLints['biome']`。名字集合钉死在这里，
 * 入口多带一个、少带一个（比如 `_` 文件被星号带上）都在这条红。
 *
 * 读的是构建产物 dist/a11y/index.d.ts 与 index.d.cts：CI 的 pr-check 先
 * build 后 test，产物新鲜；version-bump 在 build 之前跑 test，产物缺失时
 * helper 会加锁构建一次（两份公开面测试并发时只构建一次）。本机改了 src
 * 没重建时这条读到的是旧产物——以 CI 为准。
 */

describe('a11y public surface', () => {
  test('entry exports exactly the 21 pinned names', () => {
    const { dts, dcts } = getPublicSurface('a11y');
    expect(dts).toEqual([
      'A11y',
      'A11yAttrs',
      'A11yBuiltinLints',
      'A11yInput',
      'A11yLintName',
      'A11yLintOverrides',
      'A11yLints',
      'A11yNameRule',
      'A11yOf',
      'A11yOptions',
      'A11yOutputMode',
      'A11yProfile',
      'A11yRole',
      'A11yRoleRule',
      'AriaIdKey',
      'AriaIdListKey',
      'AriaKey',
      'AriaValue',
      'MergeProfiles',
      'ResolveProfile',
      'createA11y',
    ]);
    expect(dcts).toEqual(dts);
  });
});
