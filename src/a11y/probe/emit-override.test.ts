import { describe, expect, test } from 'bun:test';

import { serializeOverride } from './emit-override';

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

describe('serializeOverride', () => {
  test('first line is export {} and shape is a module augmentation', () => {
    const out = serializeOverride({ biome: profile });
    expect(out.split('\n')[0]).toBe('export {};');
    expect(out).toContain("declare module '@meld-ts/core/a11y' {");
    expect(out).toContain('interface A11yLintOverrides {');
    expect(out).toContain('biome: {');
    expect(out).toContain("source: 'probe'");
    expect(out).not.toContain('const ');
  });

  test('sorts lint entries and closes each with a semicolon', () => {
    const out = serializeOverride({
      oxlint: { ...profile, lint: 'oxlint' },
      biome: profile,
    });
    expect(out.indexOf('biome: {')).toBeLessThan(out.indexOf('oxlint: {'));
    // 条目按字面量收尾：interface 内每一项都以 `    };` 结束
    expect(out).toContain('\n    };\n');
  });

  test('is deterministic for the same profiles in any key order', () => {
    expect(serializeOverride({ oxlint: profile, biome: profile })).toBe(
      serializeOverride({ biome: profile, oxlint: profile }),
    );
  });
});
