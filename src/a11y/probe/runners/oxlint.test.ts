import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseOxlint, runOxlint } from './oxlint';

/**
 * JSON 形状按 oxlint 的 --format=json 文档，消息文本按 oxc 源码
 * （role_has_required_aria_props.rs / role_supports_aria_props.rs）手写。
 * Task 7 必须用 lab 录制的真实输出替换并复核解析器。
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
      unsupported: [{ role: 'switch', prop: 'aria-valuenow' }],
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
        '/p/.meld-a11y-probe/fixtures',
      ],
    ]);
    expect(report.unsupported).toEqual([
      { role: 'switch', prop: 'aria-valuenow' },
    ]);
  });
});
