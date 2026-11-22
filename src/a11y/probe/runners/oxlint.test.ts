import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseOxlint, runOxlint } from './oxlint';

/**
 * 手写回归固定样本：JSON 形状按 oxlint 的 --format=json 文档，消息文本
 * 按 oxc 源码（role_has_required_aria_props.rs / role_supports_aria_props.rs）
 * 写成，已在 Task 7 的真实同步里核验与真实输出一致。
 * lint 改消息文本时同步刷新。
 */
const RAW = JSON.stringify({
  diagnostics: [
    {
      code: 'jsx-a11y(role-has-required-aria-props)',
      message: '`switch` role is missing required aria props `aria-checked`.',
      severity: 'error',
    },
    {
      code: 'jsx-a11y(role-has-required-aria-props)',
      message:
        '`combobox` role is missing required aria props `aria-controls`, `aria-expanded`.',
      severity: 'error',
    },
    {
      code: 'jsx-a11y(role-supports-aria-props)',
      message:
        'The attribute `aria-valuenow` is not supported by the role `switch`.',
      severity: 'error',
    },
    {
      code: 'jsx-a11y(role-supports-aria-props)',
      message:
        'The attribute `aria-valuenow` is not supported by the role `graphics-object`.',
      severity: 'error',
    },
    {
      code: 'jsx-a11y(control-has-associated-label)',
      message: 'unrelated rule must be ignored',
      severity: 'warning',
    },
  ],
});

describe('parseOxlint', () => {
  test('extracts backticked entries, ignoring other rules', () => {
    expect(parseOxlint(RAW)).toEqual({
      missing: [
        { role: 'switch', props: ['aria-checked'] },
        { role: 'combobox', props: ['aria-controls', 'aria-expanded'] },
      ],
      unsupported: [
        { role: 'switch', prop: 'aria-valuenow' },
        { role: 'graphics-object', prop: 'aria-valuenow' },
      ],
    });
  });

  test('returns an empty report when nothing fired', () => {
    expect(parseOxlint('{"diagnostics":[]}')).toEqual({
      missing: [],
      unsupported: [],
    });
  });

  test('fails when a required message carries no aria props', () => {
    const raw = JSON.stringify({
      diagnostics: [
        {
          code: 'jsx-a11y(role-has-required-aria-props)',
          message: '`weird` role is missing required aria props nothing here.',
        },
      ],
    });
    expect(() => parseOxlint(raw)).toThrow(
      'unparseable required props: `weird` role is missing required aria props nothing here.',
    );
  });

  test('fails when a whitelisted rule carries an unknown message', () => {
    const raw = JSON.stringify({
      diagnostics: [
        {
          code: 'jsx-a11y(role-supports-aria-props)',
          message: 'The role `switch` rejects the attribute `aria-valuenow`.',
        },
      ],
    });
    expect(() => parseOxlint(raw)).toThrow(
      'oxlint jsx-a11y(role-supports-aria-props): unrecognized message: The role `switch` rejects the attribute `aria-valuenow`.',
    );
  });
});

describe('runOxlint', () => {
  test('writes config plus fixtures and lints the fixtures dir', () => {
    const writes = new Map<string, string>();
    const commands: string[][] = [];
    const exec: ExecFn = (cmd, opts) => {
      commands.push([...cmd]);
      expect(opts.cwd).toBe('/p');
      return { code: 1, stdout: RAW, stderr: '' };
    };
    const report = runOxlint(
      [
        {
          name: 'required',
          code: 'export const F0 = () => <div role="switch" />;',
        },
      ],
      {
        bin: ['oxlint-bin'],
        cwd: '/p',
        workDir: '/p/.meld-a11y-probe',
        writeFile: (path, content) => writes.set(path, content),
        exec,
      },
    );
    expect([...writes.keys()].sort()).toEqual([
      '/p/.meld-a11y-probe/config/oxlint/.oxlintrc.json',
      '/p/.meld-a11y-probe/fixtures/required.jsx',
    ]);
    expect(
      writes.get('/p/.meld-a11y-probe/config/oxlint/.oxlintrc.json'),
    ).toContain('"jsx-a11y/role-has-required-aria-props": "error"');
    expect(commands).toEqual([
      [
        'oxlint-bin',
        '-c',
        '/p/.meld-a11y-probe/config/oxlint/.oxlintrc.json',
        '-f',
        'json',
        '/p/.meld-a11y-probe/fixtures/required.jsx',
      ],
    ]);
    expect(report.unsupported).toEqual([
      { role: 'switch', prop: 'aria-valuenow' },
      { role: 'graphics-object', prop: 'aria-valuenow' },
    ]);
  });
});
