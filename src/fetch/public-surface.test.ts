import { describe, expect, test } from 'bun:test';
import { getPublicSurface } from '../../test/public-surface';

/**
 * 公开面快照：入口只导出 29 个名字。内部件（InitField / InitExtras /
 * ExactInit / QueryValue / SyncResult）与 `_internal.ts` 的辅助不进入口，
 * 入口多带一个、少带一个都在这条红。
 *
 * 读的是构建产物 dist/fetch/index.d.ts 与 index.d.cts：CI 的 pr-check 先
 * build 后 test，产物新鲜；version-bump 在 build 之前跑 test，产物缺失时
 * helper 会加锁构建一次（两份公开面测试并发时只构建一次）。本机改了 src
 * 没重建时这条读到的是旧产物——以 CI 为准。
 */

describe('fetch public surface', () => {
  test('entry exports exactly the 29 pinned names', () => {
    const { dts, dcts } = getPublicSurface('fetch');
    expect(dts).toEqual([
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
    expect(dcts).toEqual(dts);
  });
});
