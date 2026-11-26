import { describe, expect, test } from 'bun:test';
import { generateProfiles, mergeProfilesSnapshot } from './profiles-gen';
import type { ProfileData } from './serialize';

const profileOf = (lint: string): ProfileData => ({
  lint,
  version: '1.0.0',
  roles: {
    switch: {
      required: ['aria-checked'],
      supported: ['aria-checked', 'aria-label'],
      requiredWhenFocusable: [],
    },
  },
});

// 乱序插入：输出必须与插入顺序无关地按 lint 名排序。
const profiles: Record<string, ProfileData> = {
  oxlint: profileOf('oxlint'),
  biome: profileOf('biome'),
  bun: { ...profileOf('bun'), aliasOf: 'eslint' },
  eslint: profileOf('eslint'),
};

// 每行一整段 JSON：`  <lint>: <json>,`（JSON.stringify 不产生换行）。
const jsonRowsOf = (out: string): Array<readonly [string, string]> =>
  out
    .split('\n')
    .filter((line) => /^ {2}\w+: \{/.test(line))
    .map((line) => [
      line.slice(2, line.indexOf(':')),
      line.slice(line.indexOf(': ') + 2, -1),
    ]);

describe('mergeProfilesSnapshot', () => {
  test('empty base keeps only the fresh entries', () => {
    const fresh = { biome: profileOf('biome') };
    expect(mergeProfilesSnapshot({}, fresh)).toEqual(fresh);
  });

  test('partial sync replaces only the synced lint keys', () => {
    // 只同步 biome：其余三张表必须原样保留，不能被整文件重写成子集
    const fresh = {
      biome: { ...profileOf('biome'), version: '2.6.8' },
    };
    expect(mergeProfilesSnapshot(profiles, fresh)).toEqual({
      ...profiles,
      biome: fresh.biome,
    });
  });

  test('full sync replaces every key', () => {
    const fresh: Record<string, ProfileData> = {
      biome: { ...profileOf('biome'), version: '2.6.8' },
      bun: { ...profileOf('bun'), version: '1.4.4' },
      eslint: { ...profileOf('eslint'), version: '6.10.2' },
      oxlint: { ...profileOf('oxlint'), version: '1.94.0' },
    };
    expect(mergeProfilesSnapshot(profiles, fresh)).toEqual(fresh);
  });
});

describe('generateProfiles', () => {
  test('emits a PROFILES snapshot per lint as one JSON line', () => {
    const out = generateProfiles({ biome: profileOf('biome') });
    expect(out).toContain('生成文件，勿手改');
    expect(out).toContain('export const PROFILES = {');
    expect(out).toContain('} as const;');
    expect(out).toContain(
      '  biome: {"lint":"biome","version":"1.0.0","roles":',
    );
    expect(out).toContain(
      '"required":["aria-checked"],"supported":["aria-checked","aria-label"]',
    );
    expect(out).toContain('"requiredWhenFocusable":[]');
  });

  test('sorts lint keys regardless of insertion order', () => {
    const out = generateProfiles(profiles);
    const at = (lint: string): number => out.indexOf(`  ${lint}: {`);
    expect(at('biome')).toBeLessThan(at('bun'));
    expect(at('bun')).toBeLessThan(at('eslint'));
    expect(at('eslint')).toBeLessThan(at('oxlint'));
  });

  test('round-trips each profile through JSON.parse', () => {
    const out = generateProfiles(profiles);
    const rows = jsonRowsOf(out);
    expect(rows.map(([lint]) => lint)).toEqual([
      'biome',
      'bun',
      'eslint',
      'oxlint',
    ]);
    for (const [lint, json] of rows) {
      expect(JSON.parse(json)).toEqual(profiles[lint]);
    }
  });

  test('emits no undefined and no runtime dependencies', () => {
    const out = generateProfiles(profiles);
    // 无 aliasOf 的 profile 不能序列化出 undefined 值。
    expect(out).not.toContain('undefined');
    // 生成文件必须是零依赖的独立模块，可被任意 cwd 直接 import。
    expect(out).not.toContain('import ');
    expect(out).not.toContain('require(');
  });
});
