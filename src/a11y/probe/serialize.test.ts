import { describe, expect, test } from 'bun:test';
import { serializeProfile, serializeProfileLiteral } from './serialize';

const profile = {
  lint: 'biome',
  version: '2.6.8',
  roles: {
    switch: {
      required: ['aria-checked'],
      supported: ['aria-checked', 'aria-label'],
      requiredWhenFocusable: [],
    },
  },
};

describe('serializeProfile', () => {
  test('writes a type-only profile with sorted keys', () => {
    const out = serializeProfile(profile);
    expect(out).toContain('export type BiomeA11yProfile = {');
    expect(out).toContain(
      "meta: { lint: 'biome'; version: '2.6.8'; source: 'builtin' };",
    );
    expect(out).toContain('生成文件，勿手改。biome 2.6.8。');
    expect(out).toContain(
      "switch: { required: 'checked'; supported: 'checked' | 'label'; requiredWhenFocusable: never };",
    );
    expect(out).not.toContain('const ');
  });

  test('attributes the eslint table version to the jsx-a11y plugin', () => {
    const out = serializeProfile({
      ...profile,
      lint: 'eslint',
      version: '6.10.2',
    });
    // 表版本取 eslint-plugin-jsx-a11y 插件的版本（detect.ts），
    // 头部按插件署名，不能读成 eslint 自身的版本。
    expect(out).toContain('生成文件，勿手改。eslint-plugin-jsx-a11y 6.10.2。');
    expect(out).not.toContain('eslint 6.10.2');
  });

  test('writes aliasOf for alias tables', () => {
    const out = serializeProfile({
      ...profile,
      lint: 'bun',
      aliasOf: 'eslint',
      version: '6.10.2',
    });
    expect(out).toContain("aliasOf: 'eslint'");
  });

  test('sorts roles and dedupes props deterministically', () => {
    const out = serializeProfile({
      lint: 'biome',
      version: '2.6.8',
      roles: {
        switch: {
          required: ['aria-checked'],
          supported: ['aria-label', 'aria-checked', 'aria-label'],
          requiredWhenFocusable: [],
        },
        button: {
          required: [],
          supported: ['aria-expanded'],
          requiredWhenFocusable: ['aria-expanded'],
        },
      },
    });
    expect(out).toContain(
      "button: { required: never; supported: 'expanded'; requiredWhenFocusable: 'expanded' };",
    );
    expect(out).toContain(
      "switch: { required: 'checked'; supported: 'checked' | 'label'; requiredWhenFocusable: never };",
    );
    expect(out.indexOf('button:')).toBeLessThan(out.indexOf('switch:'));
  });

  test('quotes hyphenated role names as object keys', () => {
    const out = serializeProfile({
      lint: 'biome',
      version: '2.6.8',
      roles: {
        'graphics-symbol': {
          required: [],
          supported: ['aria-label'],
          requiredWhenFocusable: [],
        },
      },
    });
    expect(out).toContain(
      "'graphics-symbol': { required: never; supported: 'label'; requiredWhenFocusable: never };",
    );
  });
});

describe('serializeProfileLiteral', () => {
  test('emits a brace-to-brace literal with the given meta source', () => {
    const out = serializeProfileLiteral(profile, 'probe');
    expect(out.startsWith('{\n')).toBe(true);
    expect(out.endsWith('\n}')).toBe(true);
    expect(out).toContain(
      "meta: { lint: 'biome'; version: '2.6.8'; source: 'probe' };",
    );
    expect(out).toContain(
      "switch: { required: 'checked'; supported: 'checked' | 'label'; requiredWhenFocusable: never };",
    );
    expect(out).not.toContain('export ');
    expect(out).not.toContain('const ');
  });

  test('keeps aliasOf', () => {
    const out = serializeProfileLiteral(
      { ...profile, aliasOf: 'eslint' },
      'probe',
    );
    expect(out).toContain("aliasOf: 'eslint'");
  });

  test('serializeProfile embeds the builtin literal verbatim', () => {
    // serializeProfile 与 serializeProfileLiteral 共用同一段序列化：
    // 内置表的用户模式重跑才可能与内置表逐字节一致（生成文件确定性）。
    expect(serializeProfile(profile)).toContain(
      `= ${serializeProfileLiteral(profile, 'builtin')};`,
    );
  });
});
