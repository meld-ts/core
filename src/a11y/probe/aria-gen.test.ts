import { describe, expect, test } from 'bun:test';

import {
  ariaKeys,
  generateAriaTypes,
  generateSamples,
  nameRules,
  samplesOf,
} from './aria-gen';
import type { AriaQuerySource } from './aria-gen';

const src: AriaQuerySource = {
  aria: [
    { name: 'aria-checked', type: 'tristate' },
    { name: 'aria-controls', type: 'idlist' },
    { name: 'aria-details', type: 'id' },
    { name: 'aria-expanded', type: 'boolean' },
    { name: 'aria-level', type: 'integer' },
    {
      name: 'aria-live',
      type: 'token',
      values: ['off', 'polite', 'assertive'],
    },
    {
      name: 'aria-orientation',
      type: 'token',
      values: ['horizontal', 'undefined', 'vertical'],
    },
    { name: 'aria-valuenow', type: 'number' },
  ],
  roles: [
    {
      name: 'switch',
      abstract: false,
      requiredProps: { 'aria-checked': null },
      accessibleNameRequired: true,
      nameFrom: ['author'],
    },
    {
      name: 'img',
      abstract: false,
      requiredProps: {},
      accessibleNameRequired: true,
      nameFrom: ['author'],
    },
    {
      name: 'separator',
      abstract: false,
      requiredProps: {},
      nameFrom: ['author', 'contents'],
    },
    {
      name: 'generic',
      abstract: false,
      requiredProps: {},
      nameFrom: ['prohibited'],
    },
    {
      name: 'graphics-symbol',
      abstract: false,
      requiredProps: {},
      accessibleNameRequired: true,
      nameFrom: ['author'],
    },
    {
      name: 'roletype',
      abstract: true,
      requiredProps: {},
      nameFrom: ['none'],
    },
  ],
};

describe('generateAriaTypes', () => {
  test('emits sorted keys, values and name rules', () => {
    const out = generateAriaTypes(src);
    expect(out).toContain('export type AriaKey =');
    expect(out).toContain("| 'checked'");
    expect(out).toContain("| 'valuenow'");
    expect(out).toContain("K extends 'checked' ? boolean | 'mixed'");
    expect(out).toContain("K extends 'controls' ? string | readonly string[]");
    expect(out).toContain("export type AriaIdListKey = 'controls';");
    expect(out).toContain("export type AriaIdKey = 'details';");
    expect(out).toContain('export type A11yRole =');
    expect(out).toContain("| 'separator'");
    expect(out).not.toContain('roletype');
    expect(out).toContain("switch: 'required'");
    expect(out).toContain("separator: 'optional'");
    expect(out).toContain("generic: 'prohibited'");
    // 带连字符的 role 名不是合法标识符，作对象键必须加引号
    expect(out).toContain("readonly 'graphics-symbol': 'required';");
  });

  test('token values drop the undefined token and booleanize pairs', () => {
    const out = generateAriaTypes(src);
    expect(out).toContain("'live' ? 'assertive' | 'off' | 'polite'");
    expect(out).toContain("'orientation' ? 'horizontal' | 'vertical'");
  });
});

describe('generateSamples', () => {
  test('emits a legal sample per key', () => {
    const out = generateSamples(src);
    expect(out).toContain("'checked': 'mixed'");
    expect(out).toContain("'controls': 'x'");
    expect(out).toContain("'expanded': true");
    expect(out).toContain("'level': 1");
    expect(out).toContain("'live': 'assertive'");
    expect(out).toContain("'valuenow': 1");
  });

  test('emits samplesOf values verbatim (one source of truth)', () => {
    const out = generateSamples(src);
    for (const [key, value] of Object.entries(samplesOf(src))) {
      expect(out).toContain(`'${key}': ${value},`);
    }
  });
});

// 脚本（Task 6）直接消费的三个投影：keys / nameRule / samples 的唯一事实源。
describe('ariaKeys', () => {
  test('returns output-form keys sorted', () => {
    expect(ariaKeys(src)).toEqual([
      'checked',
      'controls',
      'details',
      'expanded',
      'level',
      'live',
      'orientation',
      'valuenow',
    ]);
  });
});

describe('nameRules', () => {
  test('maps non-abstract roles in sorted key order', () => {
    expect(nameRules(src)).toEqual({
      generic: 'prohibited',
      'graphics-symbol': 'required',
      img: 'required',
      separator: 'optional',
      switch: 'required',
    });
  });
});

describe('samplesOf', () => {
  test('returns expression strings whose values satisfy each AriaValue', () => {
    expect(samplesOf(src)).toEqual({
      checked: "'mixed'",
      controls: "'x'",
      details: "'x'",
      expanded: 'true',
      level: '1',
      live: "'assertive'",
      orientation: "'horizontal'",
      valuenow: '1',
    });
  });
});

// 边角输入：真实 aria-query 数据不会出现空 values、未知 type 或无 nameFrom
// 的 role；这里锁定各回落行为并保住探针的 100% 覆盖。
describe('generateAriaTypes and generateSamples edges', () => {
  test('string and unknown prop types fall back to string', () => {
    const edge = {
      aria: [
        { name: 'aria-placeholder', type: 'string' },
        { name: 'aria-mystery', type: 'future' },
      ],
      roles: [{ name: 'img', abstract: false, requiredProps: {} }],
    };
    const out = generateAriaTypes(edge);
    expect(out).toContain("K extends 'placeholder' ? string :");
    expect(out).toContain("K extends 'mystery' ? string :");
    // 无 nameFrom / accessibleNameRequired 的 role 归 optional。
    expect(out).toContain("img: 'optional'");
    const samples = generateSamples(edge);
    expect(samples).toContain("'placeholder': 'x'");
    expect(samples).toContain("'mystery': 'x'");
  });

  test('tokenlist collapses boolean pairs and sorts members', () => {
    const edge = {
      aria: [
        {
          name: 'aria-relevant',
          type: 'tokenlist',
          values: ['text', true, false, 'additions'],
        },
      ],
      roles: [{ name: 'img', abstract: false, requiredProps: {} }],
    };
    expect(generateAriaTypes(edge)).toContain(
      "'relevant' ? boolean | 'additions' | 'text'",
    );
    expect(generateSamples(edge)).toContain("'relevant': 'additions'");
  });

  test('token without usable values falls back', () => {
    const edge = {
      aria: [
        { name: 'aria-flag', type: 'token', values: [] },
        { name: 'aria-bit', type: 'token', values: [true, false] },
      ],
      roles: [{ name: 'img', abstract: false, requiredProps: {} }],
    };
    const out = generateAriaTypes(edge);
    expect(out).toContain("'flag' ? string");
    expect(out).toContain("'bit' ? boolean");
    const samples = generateSamples(edge);
    expect(samples).toContain("'flag': true");
    expect(samples).toContain("'bit': true");
  });

  test('no id or idlist props yields never keys', () => {
    const out = generateAriaTypes({
      aria: [{ name: 'aria-expanded', type: 'boolean' }],
      roles: [{ name: 'img', abstract: false, requiredProps: {} }],
    });
    expect(out).toContain('export type AriaIdListKey = never;');
    expect(out).toContain('export type AriaIdKey = never;');
  });

  test('required name stays optional when nameFrom includes contents', () => {
    const edge = {
      aria: [{ name: 'aria-expanded', type: 'boolean' }],
      roles: [
        {
          name: 'region',
          abstract: false,
          requiredProps: {},
          accessibleNameRequired: true,
          nameFrom: ['author', 'contents'],
        },
        {
          name: 'img',
          abstract: false,
          requiredProps: {},
          accessibleNameRequired: true,
          nameFrom: ['author'],
        },
      ],
    };
    const out = generateAriaTypes(edge);
    // role 行按名排序，输出确定。
    expect(out).toContain(
      "readonly img: 'required';\n  readonly region: 'optional';",
    );
  });

  test('id and token samples pick deterministic values', () => {
    const samples = generateSamples(src);
    expect(samples).toContain("'details': 'x'");
    expect(samples).toContain("'orientation': 'horizontal'");
  });
});
