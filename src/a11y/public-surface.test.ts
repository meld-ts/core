import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 公开面快照（1.0.3 之后按破坏性变更发版的收缩）：入口从 25 个名字收到 21 个——
 * BiomeA11yProfile / BunA11yProfile / EslintA11yProfile / OxlintA11yProfile
 * 四张表不再从入口导出，取法改为 `A11yBuiltinLints['biome']`。名字集合钉死在这里，
 * 入口多带一个、少带一个（比如 `_` 文件被星号带上）都在这条红。
 *
 * 读的是构建产物 dist/a11y/index.d.ts：CI 的 pr-check 先 build 后 test，产物新鲜；
 * version-bump 在 build 之前跑 test，产物缺失时这里自己 build:dist 再读，不 fail-open。
 * 本机改了 src 没重建时这条读到的是旧产物——以 CI 为准。
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const dtsPath = join(root, 'dist/a11y/index.d.ts');

if (!existsSync(dtsPath)) {
  const proc = Bun.spawnSync([process.execPath, 'run', 'build:dist'], {
    cwd: root,
  });
  if (proc.exitCode !== 0) {
    throw new Error(
      `build:dist exited ${proc.exitCode}:\n${proc.stdout.toString()}${proc.stderr.toString()}`,
    );
  }
  if (!existsSync(dtsPath)) {
    throw new Error('build:dist did not produce dist/a11y/index.d.ts');
  }
}

const exportNames = (() => {
  const names: string[] = [];
  const text = readFileSync(dtsPath, 'utf8');
  // tsdown 的 dts 两种形态都枚举：顶层声明（export type/interface/declare
  // function…）与单条 export { 名单 }（dist/events/index.d.ts 就是这种），
  // 只认一种会在形态切换时静默漏计
  for (const m of text.matchAll(
    /^export (?:declare )?(?:const|function|class|type|interface) (\w+)/gm,
  )) {
    // 捕获组由正则保证存在，这里的判断只为收窄 noUncheckedIndexedAccess
    const name = m[1];
    if (name === undefined) continue;
    names.push(name);
  }
  for (const m of text.matchAll(/^export \{([^}]*)\};$/gm)) {
    const list = m[1];
    // 同上：捕获组由正则保证存在
    if (list === undefined) continue;
    for (const part of list.split(',')) {
      // export { A as B } 计别名 B；export {} 空名单跳过
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name === undefined || name === '') continue;
      names.push(name);
    }
  }
  return names.sort();
})();

describe('a11y public surface', () => {
  test('entry exports exactly the 21 pinned names', () => {
    expect(exportNames).toEqual([
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
  });
});
