import { describe, expect, test } from 'bun:test';

import {
  buildFocusableFixtures,
  buildRequiredFixtures,
  buildSelfCheckFixture,
  buildSupportedFixtures,
} from './fixtures';

describe('buildRequiredFixtures', () => {
  test('writes one bare element per role into a single file', () => {
    const fixtures = buildRequiredFixtures(['switch', 'checkbox']);
    expect(fixtures.length).toBe(1);
    expect(fixtures[0]?.name).toBe('required');
    expect(fixtures[0]?.code).toBe(
      [
        'export const F0 = () => <div role="switch" />;',
        'export const F1 = () => <div role="checkbox" />;',
      ].join('\n'),
    );
  });
});

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

describe('buildFocusableFixtures', () => {
  test('writes each role with and without tabIndex into two files', () => {
    const fixtures = buildFocusableFixtures(['separator', 'switch']);
    expect(fixtures.map((f) => f.name)).toEqual([
      'focusable-plain',
      'focusable-tab',
    ]);
    expect(fixtures[0]?.code).toBe(
      [
        'export const F0 = () => <div role="separator" />;',
        'export const F1 = () => <div role="switch" />;',
      ].join('\n'),
    );
    expect(fixtures[1]?.code).toBe(
      [
        'export const F0 = () => <div role="separator" tabIndex={0} />;',
        'export const F1 = () => <div role="switch" tabIndex={0} />;',
      ].join('\n'),
    );
  });
});

describe('buildSelfCheckFixture', () => {
  test('names the expected missing prop on a bare element fixture', () => {
    expect(buildSelfCheckFixture('switch', 'aria-checked')).toEqual({
      name: 'self-check-switch-aria-checked',
      code: 'export const F0 = () => <div role="switch" />;',
    });
  });
});
