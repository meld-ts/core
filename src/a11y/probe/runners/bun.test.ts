import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseBun, runBun } from './bun';
import type { RunnerOptions } from './eslint';

/**
 * JSON 形状与消息按 bun 1.4.4 的 `bun lint -f json` 真实输出录制，两种信封：
 * oxlint 模式 `{ diagnostics: [{ code, message }] }`（code 为 `jsx-a11y(...)`
 * 形式）；默认模式是 eslint 兼容数组 `[{ messages: [{ ruleId, message }] }]`。
 * 消息文本同源（同一个内嵌引擎）。
 */
const OXLINT_RAW = JSON.stringify({
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

const EXPECTED_REPORT = {
  missing: [{ role: 'switch', props: ['aria-checked'] }],
  unsupported: [
    { role: 'graphics-symbol', prop: 'aria-valuenow' },
    { role: 'img', prop: 'aria-checked' },
  ],
};

const DEFAULTS_RAW = JSON.stringify([
  {
    filePath: '/p/f.jsx',
    messages: [
      {
        ruleId: 'jsx-a11y/role-has-required-aria-props',
        message: '`switch` role is missing required aria props `aria-checked`.',
      },
      {
        ruleId: 'jsx-a11y/role-supports-aria-props',
        message:
          'The attribute `aria-checked` is not supported by the role `img`.',
      },
      {
        ruleId: 'jsx-a11y/no-autofocus',
        message: 'unrelated rule must be ignored',
      },
      // ruleId 为 null 的消息（无规则的内部诊断）也要被忽略
      { ruleId: null, message: 'internal diagnostic without a rule' },
    ],
  },
]);

const DEFAULTS_REPORT = {
  missing: [{ role: 'switch', props: ['aria-checked'] }],
  unsupported: [{ role: 'img', prop: 'aria-checked' }],
};

describe('parseBun', () => {
  test('extracts entries from the oxlint-mode envelope', () => {
    expect(parseBun(OXLINT_RAW)).toEqual(EXPECTED_REPORT);
  });

  test('extracts entries from the defaults-mode envelope', () => {
    expect(parseBun(DEFAULTS_RAW)).toEqual(DEFAULTS_REPORT);
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

  test('fails when a whitelisted rule carries an unknown message', () => {
    const raw = JSON.stringify({
      diagnostics: [
        {
          code: 'jsx-a11y(role-supports-aria-props)',
          message: 'The role `switch` rejects the attribute `aria-valuenow`.',
        },
      ],
    });
    expect(() => parseBun(raw)).toThrow(
      'bun jsx-a11y(role-supports-aria-props): unrecognized message: The role `switch` rejects the attribute `aria-valuenow`.',
    );
  });

  test('fails readably when the defaults envelope misses messages', () => {
    expect(() => parseBun('[{"filePath":"/p/f.jsx"}]')).toThrow(
      'bun lint output is missing messages',
    );
  });
});

const FIXTURE = [
  {
    name: 'required',
    code: 'export const F0 = () => <div role="switch" />;',
  },
];

const runnerOpts = (
  bin: readonly string[],
  exec: ExecFn,
  writes: Map<string, string>,
): RunnerOptions => ({
  bin,
  cwd: '/p',
  workDir: '/p/.meld-a11y-probe',
  writeFile: (path, content) => writes.set(path, content),
  exec,
});

describe('runBun', () => {
  test('runs the detected bun command with inline rules and writes no config', () => {
    const writes = new Map<string, string>();
    const commands: string[][] = [];
    const exec: ExecFn = (cmd, opts) => {
      commands.push([...cmd]);
      expect(opts.cwd).toBe('/p');
      return { code: 1, stdout: OXLINT_RAW, stderr: '' };
    };
    const report = runBun(
      FIXTURE,
      runnerOpts(
        [process.execPath, 'lint', '--no-script', '--jsx-a11y-plugin'],
        exec,
        writes,
      ),
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

  test('parses the defaults-mode envelope when the bin has no plugin flag', () => {
    const writes = new Map<string, string>();
    const exec: ExecFn = () => ({ code: 1, stdout: DEFAULTS_RAW, stderr: '' });
    const report = runBun(
      FIXTURE,
      runnerOpts([process.execPath, 'lint', '--no-script'], exec, writes),
    );
    expect(report).toEqual(DEFAULTS_REPORT);
  });

  test('fails with lint stderr when the command is rejected with empty stdout', () => {
    const exec: ExecFn = () => ({
      code: 2,
      stdout: '',
      stderr: 'error: --jsx-a11y-plugin is an oxlint flag',
    });
    expect(() =>
      runBun(
        FIXTURE,
        runnerOpts(
          [process.execPath, 'lint', '--no-script', '--jsx-a11y-plugin'],
          exec,
          new Map(),
        ),
      ),
    ).toThrow('bun lint exited 2: error: --jsx-a11y-plugin is an oxlint flag');
  });
});
