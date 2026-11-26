import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 公开面快照：入口只导出 29 个名字。内部件（InitField / InitExtras /
 * ExactInit / QueryValue / SyncResult）与 `_internal.ts` 的辅助不进入口，
 * 入口多带一个、少带一个都在这条红。
 *
 * 读的是构建产物 dist/fetch/index.d.ts：CI 的 pr-check 先 build 后 test，
 * 产物新鲜；version-bump 在 build 之前跑 test，产物缺失时这里自己
 * build:dist 再读，不 fail-open。本机改了 src 没重建时这条读到的是旧产物
 * ——以 CI 为准。
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const dtsPath = join(root, 'dist/fetch/index.d.ts');

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
    throw new Error('build:dist did not produce dist/fetch/index.d.ts');
  }
}

const exportNames = (() => {
  const names: string[] = [];
  // bunup 把 class 和 value / type 一起写进同一条 `export { ... };`，
  // FetchError 因此在这里出现一次，不需要另外匹配 `export declare class`。
  for (const m of readFileSync(dtsPath, 'utf8').matchAll(
    /^export \{ ([^}]*) \};$/gm,
  )) {
    // 捕获组由正则保证存在，这里的判断只为收窄 noUncheckedIndexedAccess
    const list = m[1];
    if (list === undefined) continue;
    names.push(...list.split(',').map((n) => n.trim()));
  }
  return names.sort();
})();

describe('fetch public surface', () => {
  test('entry exports exactly the 29 pinned names', () => {
    expect(exportNames).toEqual([
      'AllowNil',
      'AllowNilOptions',
      'BodyRead',
      'Decode',
      'DecodeContext',
      'Decoded',
      'DefaultInit',
      'DefaultRes',
      'FetchError',
      'FetchErrorKind',
      'FetchErrorOf',
      'FetchErrorOptions',
      'FetchInit',
      'FetchLike',
      'FetchRequest',
      'Fetcher',
      'FetcherOptions',
      'HeaderValues',
      'InitOf',
      'ParseOptions',
      'RequireFor',
      'ResOf',
      'ResponseLike',
      'SendOptions',
      'SuccessEnvelopeFailure',
      'allowNil',
      'createFetcher',
      'readBody',
      'successEnvelope',
    ]);
  });
});
