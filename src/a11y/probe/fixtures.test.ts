import { describe, expect, test } from 'bun:test';

import {
  attrsOf,
  batchFiles,
  buildRemovalFixtures,
  buildSelfCheckFixture,
  buildSupportedFixtures,
  elementOf,
  expressionOf,
  fixtureSamples,
} from './fixtures';

describe('buildSupportedFixtures', () => {
  const samples = { checked: 'true', label: "'x'", valuenow: '1' };

  test('writes one role x key element per line with sample values', () => {
    const fixtures = buildSupportedFixtures(['switch'], ['checked', 'label'], {
      checked: 'true',
      label: "'x'",
    });
    expect(fixtures.length).toBe(1);
    expect(fixtures[0]?.name).toBe('supported-0');
    expect(fixtures[0]?.code).toBe(
      [
        'export const F0 = () => <div role="switch" aria-checked={true} />;',
        `export const F1 = () => <div role="switch" aria-label={'x'} />;`,
      ].join('\n'),
    );
  });

  test('batches elements by batchSize across files', () => {
    const fixtures = buildSupportedFixtures(
      ['switch', 'checkbox', 'slider'],
      ['checked', 'label'],
      samples,
      4,
    );
    expect(fixtures.map((f) => f.name)).toEqual(['supported-0', 'supported-1']);
    expect(fixtures[0]?.code.split('\n').length).toBe(4);
    expect(fixtures[1]?.code.split('\n').length).toBe(2);
    // 第二批从 slider 开始，元素序号在文件内重新计数
    expect(fixtures[1]?.code.split('\n')[0]).toBe(
      'export const F0 = () => <div role="slider" aria-checked={true} />;',
    );
  });

  test('pads file names to the file count width', () => {
    const fixtures = buildSupportedFixtures(
      ['a', 'b', 'c', 'd', 'e'],
      ['checked', 'label'],
      samples,
      1,
    );
    expect(fixtures.map((f) => f.name)).toEqual([
      'supported-00',
      'supported-01',
      'supported-02',
      'supported-03',
      'supported-04',
      'supported-05',
      'supported-06',
      'supported-07',
      'supported-08',
      'supported-09',
    ]);
  });

  test('fails on a key without a sample value', () => {
    expect(() =>
      buildSupportedFixtures(['switch'], ['nonsense'], samples),
    ).toThrow('no sample value for aria key: nonsense');
  });
});

describe('buildRemovalFixtures', () => {
  const samples = { checked: 'true', expanded: 'true', label: "'x'" };
  const supported = {
    checkbox: ['checked', 'expanded'],
    switch: ['checked', 'label'],
  };

  test('baseline keeps every supported prop', () => {
    expect(buildRemovalFixtures(['checkbox'], supported, samples)).toEqual([
      {
        name: 'removal-baseline-0',
        code: 'export const F0 = () => <div role="checkbox" aria-checked={true} aria-expanded={true} />;',
      },
    ]);
  });

  test('removes only the given key per role', () => {
    expect(
      buildRemovalFixtures(['checkbox', 'switch'], supported, samples, {
        remove: 'checked',
      }),
    ).toEqual([
      {
        name: 'removal-checked-0',
        code: [
          'export const F0 = () => <div role="checkbox" aria-expanded={true} />;',
          `export const F1 = () => <div role="switch" aria-label={'x'} />;`,
        ].join('\n'),
      },
    ]);
  });

  test('focusable variant prepends tabIndex and a focusable- prefix', () => {
    expect(
      buildRemovalFixtures(['switch'], supported, samples, {
        remove: 'checked',
        focusable: true,
      }),
    ).toEqual([
      {
        name: 'focusable-removal-checked-0',
        code: `export const F0 = () => <div role="switch" tabIndex={0} aria-label={'x'} />;`,
      },
    ]);
  });

  test('treats a role missing from the supported map as bare', () => {
    expect(buildRemovalFixtures(['generic'], supported, samples)).toEqual([
      {
        name: 'removal-baseline-0',
        code: 'export const F0 = () => <div role="generic" />;',
      },
    ]);
  });

  test('batches elements like supported fixtures', () => {
    const fixtures = buildRemovalFixtures(
      ['checkbox', 'switch'],
      supported,
      samples,
      {},
      1,
    );
    expect(fixtures.map((f) => f.name)).toEqual([
      'removal-baseline-0',
      'removal-baseline-1',
    ]);
  });
});

describe('buildSelfCheckFixture', () => {
  test('writes all supported props except the missing one', () => {
    expect(
      buildSelfCheckFixture(
        'switch',
        ['checked', 'label', 'labelledby'],
        'checked',
        { checked: 'true', label: "'x'", labelledby: "'x'" },
      ),
    ).toEqual({
      name: 'self-check-switch-aria-checked',
      code: `export const F0 = () => <div role="switch" aria-label={'x'} aria-labelledby={'x'} />;`,
    });
  });
});

describe('expressionOf / fixtureSamples', () => {
  test('quotes strings, keeps booleans and numbers literal', () => {
    expect(expressionOf('both')).toBe("'both'");
    expect(expressionOf(true)).toBe('true');
    expect(expressionOf(1)).toBe('1');
  });

  test('converts runtime SAMPLES into expression text', () => {
    expect(fixtureSamples({ label: 'x', atomic: true, colcount: 1 })).toEqual({
      label: "'x'",
      atomic: 'true',
      colcount: '1',
    });
  });
});

describe('exported fixture vocabulary', () => {
  test('elementOf and attrsOf compose an element line', () => {
    expect(elementOf('switch', attrsOf(['checked'], { checked: 'true' }))).toBe(
      '<div role="switch" aria-checked={true} />',
    );
  });

  test('batchFiles batches elements and pads file names', () => {
    expect(batchFiles(['a', 'b', 'c'], 'x', 2).map((f) => f.name)).toEqual([
      'x-0',
      'x-1',
    ]);
  });
});
