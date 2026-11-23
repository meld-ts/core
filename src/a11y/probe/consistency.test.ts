import { describe, expect, test } from 'bun:test';

import {
  buildConsistencyFixtures,
  buildReverseFixtures,
  mergeProfiles,
} from './consistency';
import type { ProfileData } from './serialize';

// 样例值沿用生成文件经 fixtureSamples 转换后的表达式形态：
// 字符串带引号（aria-label={'x'}），布尔/数字原样
const SAMPLES = {
  checked: "'mixed'",
  controls: "'x'",
  expanded: 'true',
  label: "'x'",
  valuenow: '1',
};

const PROFILE: ProfileData = {
  lint: 'test',
  version: '1.0.0',
  roles: {
    combobox: {
      required: ['aria-expanded', 'aria-controls'],
      supported: ['aria-controls', 'aria-expanded', 'aria-label'],
      requiredWhenFocusable: [],
    },
    img: {
      required: [],
      supported: ['aria-label'],
      requiredWhenFocusable: [],
    },
    separator: {
      required: [],
      supported: ['aria-label', 'aria-valuenow'],
      requiredWhenFocusable: ['aria-valuenow'],
    },
    switch: {
      required: ['aria-checked'],
      supported: ['aria-checked', 'aria-label'],
      requiredWhenFocusable: [],
    },
  },
};

describe('mergeProfiles', () => {
  const A: ProfileData = {
    lint: 'a',
    version: '1.0.0',
    roles: {
      switch: {
        required: ['aria-checked'],
        supported: ['aria-label', 'aria-checked'],
        requiredWhenFocusable: [],
      },
      img: {
        required: [],
        supported: ['aria-label', 'aria-valuenow'],
        requiredWhenFocusable: [],
      },
    },
  };
  const B: ProfileData = {
    lint: 'b',
    version: '2.0.0',
    roles: {
      switch: {
        required: [],
        supported: ['aria-label'],
        requiredWhenFocusable: ['aria-valuenow'],
      },
      img: {
        required: ['aria-valuenow'],
        supported: ['aria-valuenow', 'aria-label'],
        requiredWhenFocusable: [],
      },
    },
  };

  test('unions required, intersects supported, unions requiredWhenFocusable', () => {
    const merged = mergeProfiles([A, B]);
    expect(merged.roles.switch).toEqual({
      required: ['aria-checked'],
      supported: ['aria-label'],
      requiredWhenFocusable: ['aria-valuenow'],
    });
    expect(merged.roles.img).toEqual({
      required: ['aria-valuenow'],
      supported: ['aria-label', 'aria-valuenow'],
      requiredWhenFocusable: [],
    });
  });

  test('joins lint and version names and sorts roles', () => {
    const merged = mergeProfiles([B, A]);
    expect(merged.lint).toBe('b+a');
    expect(merged.version).toBe('2.0.0+1.0.0');
    expect(Object.keys(merged.roles)).toEqual(['img', 'switch']);
  });

  test('folds three profiles the same way', () => {
    const C: ProfileData = {
      lint: 'c',
      version: '3.0.0',
      roles: {
        switch: {
          required: ['aria-checked'],
          supported: ['aria-checked', 'aria-label', 'aria-valuenow'],
          requiredWhenFocusable: [],
        },
        img: {
          required: [],
          supported: ['aria-label', 'aria-valuenow'],
          requiredWhenFocusable: [],
        },
      },
    };
    const merged = mergeProfiles([A, B, C]);
    expect(merged.roles.switch).toEqual({
      required: ['aria-checked'],
      supported: ['aria-label'],
      requiredWhenFocusable: ['aria-valuenow'],
    });
    expect(merged.roles.img).toEqual({
      required: ['aria-valuenow'],
      supported: ['aria-label', 'aria-valuenow'],
      requiredWhenFocusable: [],
    });
  });

  test('fails when a profile misses a role another has', () => {
    const onlySwitch: ProfileData = {
      lint: 'd',
      version: '4.0.0',
      roles: {
        switch: {
          required: [],
          supported: ['aria-label'],
          requiredWhenFocusable: [],
        },
      },
    };
    expect(() => mergeProfiles([A, onlySwitch])).toThrow(
      'mergeProfiles: d has no data for role img',
    );
  });

  test('fails when a profile carries an extra role', () => {
    const withExtra: ProfileData = {
      lint: 'e',
      version: '5.0.0',
      roles: {
        ...A.roles,
        banner: {
          required: [],
          supported: ['aria-label'],
          requiredWhenFocusable: [],
        },
      },
    };
    expect(() => mergeProfiles([A, withExtra])).toThrow(
      'mergeProfiles: a has no data for role banner',
    );
  });

  test('fails on empty input', () => {
    expect(() => mergeProfiles([])).toThrow(
      'mergeProfiles needs at least one profile',
    );
  });
});

describe('buildConsistencyFixtures', () => {
  test('required-only carries just the required props, sorted', () => {
    const { requiredOnly } = buildConsistencyFixtures(PROFILE, SAMPLES);
    expect(requiredOnly).toEqual([
      {
        name: 'required-only-0',
        code: [
          `export const F0 = () => <div role="combobox" aria-controls={'x'} aria-expanded={true} />;`,
          'export const F1 = () => <div role="img" />;',
          'export const F2 = () => <div role="separator" />;',
          `export const F3 = () => <div role="switch" aria-checked={'mixed'} />;`,
        ].join('\n'),
      },
    ]);
  });

  test('all-supported carries every supported prop', () => {
    const { allSupported } = buildConsistencyFixtures(PROFILE, SAMPLES);
    expect(allSupported).toEqual([
      {
        name: 'all-supported-0',
        code: [
          `export const F0 = () => <div role="combobox" aria-controls={'x'} aria-expanded={true} aria-label={'x'} />;`,
          `export const F1 = () => <div role="img" aria-label={'x'} />;`,
          `export const F2 = () => <div role="separator" aria-label={'x'} aria-valuenow={1} />;`,
          `export const F3 = () => <div role="switch" aria-checked={'mixed'} aria-label={'x'} />;`,
        ].join('\n'),
      },
    ]);
  });

  test('focusable-all covers only roles with requiredWhenFocusable', () => {
    const { focusableAll } = buildConsistencyFixtures(PROFILE, SAMPLES);
    expect(focusableAll).toEqual([
      {
        name: 'focusable-all-0',
        code: `export const F0 = () => <div role="separator" tabIndex={0} aria-label={'x'} aria-valuenow={1} />;`,
      },
    ]);
  });

  test('batches elements per batchSize with padded file names', () => {
    const fixtures = buildConsistencyFixtures(PROFILE, SAMPLES, 2);
    expect(fixtures.requiredOnly.map((f) => f.name)).toEqual([
      'required-only-0',
      'required-only-1',
    ]);
    expect(fixtures.requiredOnly[1]?.code).toBe(
      [
        'export const F0 = () => <div role="separator" />;',
        `export const F1 = () => <div role="switch" aria-checked={'mixed'} />;`,
      ].join('\n'),
    );
    expect(fixtures.focusableAll.map((f) => f.name)).toEqual([
      'focusable-all-0',
    ]);
  });

  test('fails on a required prop without a sample value', () => {
    const broken: ProfileData = {
      lint: 'test',
      version: '1.0.0',
      roles: {
        switch: {
          required: ['aria-mystery'],
          supported: ['aria-mystery'],
          requiredWhenFocusable: [],
        },
      },
    };
    expect(() => buildConsistencyFixtures(broken, SAMPLES)).toThrow(
      'no sample value for aria key: mystery',
    );
  });
});

describe('buildReverseFixtures', () => {
  test('drops the first sorted required prop, keeps the rest of supported', () => {
    const { required, specs } = buildReverseFixtures(PROFILE, SAMPLES);
    expect(required).toEqual([
      {
        name: 'reverse-required-0',
        code: [
          `export const F0 = () => <div role="combobox" aria-expanded={true} aria-label={'x'} />;`,
          `export const F1 = () => <div role="switch" aria-label={'x'} />;`,
        ].join('\n'),
      },
    ]);
    expect(specs.filter((s) => !s.focusable)).toEqual([
      { role: 'combobox', prop: 'aria-controls', focusable: false },
      { role: 'switch', prop: 'aria-checked', focusable: false },
    ]);
  });

  test('focusable variant drops a requiredWhenFocusable prop with tabIndex', () => {
    const { focusable, specs } = buildReverseFixtures(PROFILE, SAMPLES);
    expect(focusable).toEqual([
      {
        name: 'reverse-focusable-0',
        code: `export const F0 = () => <div role="separator" tabIndex={0} aria-label={'x'} />;`,
      },
    ]);
    expect(specs.filter((s) => s.focusable)).toEqual([
      { role: 'separator', prop: 'aria-valuenow', focusable: true },
    ]);
  });

  test('batches elements per batchSize', () => {
    const { required } = buildReverseFixtures(PROFILE, SAMPLES, 1);
    expect(required.map((f) => f.name)).toEqual([
      'reverse-required-0',
      'reverse-required-1',
    ]);
  });
});
