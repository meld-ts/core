import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { PROFILES } from './profiles.generated';
import type { ProfileData, RoleRuleData } from './serialize';

/**
 * lints/_<name>.ts（类型表）与 profiles.generated.ts（运行时快照）由同一次
 * a11y:sync 写出，这里守住两张表不各自漂移：表头 meta 的 lint/version 一致，
 * 且逐 role 比较三张键集（required / supported / requiredWhenFocusable）。
 * 不做逐字节比较——lints/_*.ts 要过 biome 格式化，空白与断行会动；比较
 * 落在语义（键集合）上。
 */

// 折叠全部空白后，一条 role 条目形如
// `name: { required: U; supported: U; requiredWhenFocusable: U; }`，
// U 是 `never` 或 `'a' | 'b'` 形态的并集（折叠后可能带前导 `|`）。
// 名字一组捕获（带引号的 'doc-abstract' 与裸键 switch 两种形态，引号
// 事后剥掉）；末字段的 `;` 可有可无（biome 把全空 role 折成单行时没有
// 它）；meta 行没有 required/supported 结构，不会误配。
const ROLE_ENTRY =
  /('[^']+'|[A-Za-z_$][A-Za-z0-9_$-]*): \{ required: ([^;]*); supported: ([^;]*); requiredWhenFocusable: ([^;]*);? \}/g;

// 快照与类型表的键形态不同：快照是 aria-* 输入形态，类型表是输出形态
const keyOf = (name: string): string => name.replace(/^aria-/, '');

const unionOf = (text: string): string[] => {
  const members = text
    .split('|')
    .map((member) => member.trim().replaceAll("'", ''))
    .filter((member) => member.length > 0 && member !== 'never');
  return [...new Set(members)].sort();
};

const rolesOf = (text: string): Record<string, RoleRuleData> => {
  const out: Record<string, RoleRuleData> = {};
  // 折叠空白再解析：biome 格式化的断行/缩进不参与比较
  for (const match of text.replaceAll(/\s+/g, ' ').matchAll(ROLE_ENTRY)) {
    const [, name, required, supported, requiredWhenFocusable] = match;
    // 捕获组按 noUncheckedIndexedAccess 是 string | undefined；一条
    // 命中里四组都实际存在，这里只收窄类型
    if (
      name === undefined ||
      required === undefined ||
      supported === undefined ||
      requiredWhenFocusable === undefined
    ) {
      continue;
    }
    out[name.replaceAll("'", '')] = {
      required: unionOf(required),
      supported: unionOf(supported),
      requiredWhenFocusable: unionOf(requiredWhenFocusable),
    };
  }
  return out;
};

describe('lints tables stay in sync with PROFILES', () => {
  for (const [lint, snapshot] of Object.entries(PROFILES)) {
    const profile: ProfileData = snapshot;
    test(`${lint} table matches its PROFILES snapshot`, () => {
      const text = readFileSync(
        join(import.meta.dir, '../lints', `_${lint}.ts`),
        'utf8',
      );
      expect(text).toContain(
        `meta: { lint: '${lint}'; version: '${profile.version}'; source: 'builtin' };`,
      );
      const actual = rolesOf(text);
      expect(Object.keys(actual).sort()).toEqual(
        Object.keys(profile.roles).sort(),
      );
      for (const [role, rule] of Object.entries(profile.roles)) {
        expect(actual[role]).toEqual({
          required: [...rule.required].map(keyOf).sort(),
          supported: [...rule.supported].map(keyOf).sort(),
          requiredWhenFocusable: [...rule.requiredWhenFocusable]
            .map(keyOf)
            .sort(),
        });
      }
    });
  }
});
