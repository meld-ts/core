import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { PROFILES } from './profiles.generated';

/**
 * lints/<name>.ts（类型表）与 profiles.generated.ts（运行时快照）由同一次
 * a11y:sync 写出，这里守住两张表不各自漂移：表头 meta 的 lint/version 与
 * 快照一致，role 集与快照一致。不做逐字节比较——lints/*.ts 要过 biome
 * 格式化，空白与断行会动；断言落在可比较的信号上（表头 + role 集）。
 */

// roles 对象的键独占一行的 4 空格缩进：带连字符的键加引号（'doc-abstract'），
// 简单键不加；全空的 role 会被 biome 折成一行（`none: { ... };`），匹配停在
// 开头的 `: {`，多行与单行两种形态都吃到。
const ROLE_LINE = /^ {4}(?:'[^']+'|[a-z-]+): \{/gm;

// 整行截出键名：去掉 4 空格缩进与 `: {`，剥掉带引号键的引号
const rolesOf = (text: string): string[] =>
  [...text.matchAll(ROLE_LINE)].map((m) => m[0].slice(4, -3).replace(/'/g, ''));

describe('lints tables stay in sync with PROFILES', () => {
  for (const [lint, profile] of Object.entries(PROFILES)) {
    test(`${lint} table matches its PROFILES snapshot`, () => {
      const text = readFileSync(
        join(import.meta.dir, '../lints', `${lint}.ts`),
        'utf8',
      );
      expect(text).toContain(
        `meta: { lint: '${lint}'; version: '${profile.version}'; source: 'builtin' };`,
      );
      const expected = Object.keys(profile.roles).sort();
      const actual = rolesOf(text).sort();
      expect(actual.length).toBe(expected.length);
      expect(actual).toEqual(expected);
    });
  }
});
