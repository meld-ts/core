import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseBun, runBun } from './bun';

/**
 * JSON 形状与消息按 bun 1.4.4-canary.1 的 `bun lint -f json` 真实输出录制：
 * 内嵌 oxlint，`{ diagnostics: [{ code, message }] }`，规则 code 是
 * `jsx-a11y(...)` 形式，消息文本为反引号风格。
 */
const RAW = JSON.stringify({
  diagnostics: [
    {
      code: 'jsx-a11y(role-has-required-aria-props)',
      message: '`switch` role is missing required aria props `aria-checked`.',
    },
    {
      code: 'jsx-a11y(role-supports-aria-props)',
      message:
        'The attribute `aria-valuenow` is not supported by the role `graphics-symbol`.',
    },
    {
      code: 'jsx-a11y(role-supports-aria-props)',
      message:
        'The attribute `aria-checked` is not supported by the role `img`.',
    },
    {
      code: 'jsx-a11y(prefer-tag-over-role)',
      message: 'unrelated rule must be ignored',
    },
  ],
});

describe('parseBun', () => {
  test('extracts backticked entries, ignoring other rules', () => {
    expect(parseBun(RAW)).toEqual({
      missing: [{ role: 'switch', props: ['aria-checked'] }],
      unsupported: [
        { role: 'graphics-symbol', prop: 'aria-valuenow' },
        { role: 'img', prop: 'aria-checked' },
      ],
    });
  });

  test('returns an empty report when nothing fired', () => {
    expect(parseBun('{"diagnostics":[]}')).toEqual({
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
    expect(() => parseBun(raw)).toThrow(
      'unparseable required props: `weird` role is missing required aria props nothing here.',
    );
  });
});

describe('runBun', () => {
  test('runs the current bun with inline rules and writes no config', () => {
    const writes = new Map<string, string>();
    const commands: string[][] = [];
    const exec: ExecFn = (cmd, opts) => {
      commands.push([...cmd]);
      expect(opts.cwd).toBe('/p');
      return { code: 1, stdout: RAW, stderr: '' };
    };
    const report = runBun(
      [
        {
          name: 'required',
          code: 'export const F0 = () => <div role="switch" />;',
        },
      ],
      {
        cwd: '/p',
        workDir: '/p/.meld-a11y-probe',
        writeFile: (path, content) => writes.set(path, content),
        exec,
      },
    );
    expect([...writes.keys()]).toEqual([
      '/p/.meld-a11y-probe/fixtures/required.jsx',
    ]);
    expect(commands).toEqual([
      [
        process.execPath,
        'lint',
        '--no-script',
        '--jsx-a11y-plugin',
        '-f',
        'json',
        '--rule',
        'jsx_a11y/role-has-required-aria-props: error',
        '--rule',
        'jsx_a11y/role-supports-aria-props: error',
        '/p/.meld-a11y-probe/fixtures/required.jsx',
      ],
    ]);
    expect(report.missing).toEqual([
      { role: 'switch', props: ['aria-checked'] },
    ]);
  });
});
