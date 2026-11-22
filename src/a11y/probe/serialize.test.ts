import { describe, expect, test } from 'bun:test';

import { serializeProfile } from './serialize';

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
    expect(out).toContain(
      "switch: { required: 'checked'; supported: 'checked' | 'label'; requiredWhenFocusable: never };",
    );
    expect(out).not.toContain('const ');
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
});
