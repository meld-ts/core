import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseBun, runBun } from './bun';

/**
 * JSON 形状与消息按 Plan B 前序会话对 bun lint canary 的实测记录手写：
 * 输出与 eslint 同形，消息文本是反引号风格（规则移植自 oxlint）。
 * bun lint 尚未进 stable，本机无法复跑，Task 7 必须用真实输出复核。
 */
const RAW = JSON.stringify([
  {
    filePath: '/p/.meld-a11y-probe/fixtures/required.jsx',
    messages: [
      {
        ruleId: 'jsx-a11y/role-has-required-aria-props',
        message: '`switch` role is missing required aria props `aria-checked`.',
      },
      {
        ruleId: 'jsx-a11y/role-supports-aria-props',
        message:
          'The attribute `aria-valuenow` is not supported by the role `switch`.',
      },
      {
        ruleId: 'jsx-a11y/no-autofocus',
        message: 'unrelated rule must be ignored',
      },
    ],
  },
]);

describe('parseBun', () => {
  test('extracts backticked entries, ignoring other rules', () => {
    expect(parseBun(RAW)).toEqual({
      missing: [{ role: 'switch', props: ['aria-checked'] }],
      unsupported: [{ role: 'switch', prop: 'aria-valuenow' }],
    });
  });

  test('returns an empty report when nothing fired', () => {
    expect(parseBun('[]')).toEqual({ missing: [], unsupported: [] });
  });

  test('fails when a required message carries no aria props', () => {
    const raw = JSON.stringify([
      {
        messages: [
          {
            ruleId: 'jsx-a11y/role-has-required-aria-props',
            message:
              '`weird` role is missing required aria props nothing here.',
          },
        ],
      },
    ]);
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
        '-f',
        'json',
        '--rule',
        'jsx_a11y/role-has-required-aria-props: error',
        '--rule',
        'jsx_a11y/role-supports-aria-props: error',
        '/p/.meld-a11y-probe/fixtures',
      ],
    ]);
    expect(report.missing).toEqual([
      { role: 'switch', props: ['aria-checked'] },
    ]);
  });
});
