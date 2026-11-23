import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseEslint, runEslint } from './eslint';

/**
 * 手写回归固定样本：消息按 eslint-plugin-jsx-a11y 6.x 源码的模板写
 * （role-has-required-aria-props / role-supports-aria-props），已在
 * Task 7 的真实同步里核验与真实输出一致。lint 改消息文本时同步刷新。
 */
const RAW = JSON.stringify([
  {
    filePath: '/p/.meld-a11y-probe/fixtures/required.jsx',
    messages: [
      {
        ruleId: 'jsx-a11y/role-has-required-aria-props',
        message:
          'Elements with the ARIA role "combobox" must have the following attributes defined: aria-expanded,aria-controls',
      },
      {
        ruleId: 'jsx-a11y/role-supports-aria-props',
        message:
          'The attribute aria-valuenow is not supported by the role switch.',
      },
      {
        ruleId: 'jsx-a11y/role-supports-aria-props',
        message:
          'The attribute aria-valuenow is not supported by the role doc-abstract.',
      },
      {
        ruleId: 'jsx-a11y/no-static-element-interactions',
        message: 'unrelated rule must be ignored',
      },
    ],
  },
]);

describe('parseEslint', () => {
  test('extracts required and unsupported entries, ignoring other rules', () => {
    expect(parseEslint(RAW)).toEqual({
      missing: [
        { role: 'combobox', props: ['aria-expanded', 'aria-controls'] },
      ],
      unsupported: [
        { role: 'switch', prop: 'aria-valuenow' },
        { role: 'doc-abstract', prop: 'aria-valuenow' },
      ],
    });
  });

  test('returns an empty report when nothing fired', () => {
    expect(parseEslint('[]')).toEqual({ missing: [], unsupported: [] });
  });

  test('fails readably when the envelope is not an array', () => {
    expect(() => parseEslint('{"summary":{"errors":0}}')).toThrow(
      'eslint lint output is not an array',
    );
  });

  test('fails readably when the envelope misses messages', () => {
    expect(() => parseEslint('[{"filePath":"/p/f.jsx"}]')).toThrow(
      'eslint lint output is missing messages',
    );
  });

  test('fails when a whitelisted rule carries an unknown message', () => {
    const raw = JSON.stringify([
      {
        messages: [
          {
            ruleId: 'jsx-a11y/role-supports-aria-props',
            message: 'The role switch rejects the attribute aria-valuenow.',
          },
        ],
      },
    ]);
    expect(() => parseEslint(raw)).toThrow(
      'eslint jsx-a11y/role-supports-aria-props: unrecognized message: The role switch rejects the attribute aria-valuenow.',
    );
  });
  test('fails readably when a whitelisted rule is missing its message', () => {
    // 非白名单的规则缺 message 仍被忽略；白名单内的缺 message 报可读错误
    const raw = JSON.stringify([
      {
        messages: [
          { ruleId: 'jsx-a11y/no-static-element-interactions' },
          { ruleId: 'jsx-a11y/role-has-required-aria-props' },
        ],
      },
    ]);
    expect(() => parseEslint(raw)).toThrow(
      'eslint diagnostic is missing message',
    );
  });
});

describe('runEslint', () => {
  test('writes config plus fixtures and lints the fixtures dir', () => {
    const writes = new Map<string, string>();
    const commands: string[][] = [];
    const exec: ExecFn = (cmd, opts) => {
      commands.push([...cmd]);
      expect(opts.cwd).toBe('/p');
      return { code: 1, stdout: RAW, stderr: '' };
    };
    const report = runEslint(
      [
        {
          name: 'required',
          code: 'export const F0 = () => <div role="switch" />;',
        },
      ],
      {
        bin: ['eslint-bin'],
        cwd: '/p',
        workDir: '/p/.meld-a11y-probe',
        writeFile: (path, content) => writes.set(path, content),
        exec,
      },
    );
    expect([...writes.keys()].sort()).toEqual([
      '/p/.meld-a11y-probe/config/eslint/eslint.config.mjs',
      '/p/.meld-a11y-probe/fixtures/required.jsx',
    ]);
    expect(
      writes.get('/p/.meld-a11y-probe/config/eslint/eslint.config.mjs'),
    ).toContain("'jsx-a11y/role-has-required-aria-props': 'error'");
    expect(commands).toEqual([
      [
        'eslint-bin',
        '-c',
        '/p/.meld-a11y-probe/config/eslint/eslint.config.mjs',
        '-f',
        'json',
        '/p/.meld-a11y-probe/fixtures',
      ],
    ]);
    expect(report.missing).toEqual([
      { role: 'combobox', props: ['aria-expanded', 'aria-controls'] },
    ]);
  });

  test('fails with lint stderr when the command is rejected with empty stdout', () => {
    const exec: ExecFn = () => ({
      code: 2,
      stdout: '',
      stderr: 'ESLint configuration in --config file is invalid.',
    });
    expect(() =>
      runEslint(
        [
          {
            name: 'required',
            code: 'export const F0 = () => <div role="switch" />;',
          },
        ],
        {
          bin: ['eslint-bin'],
          cwd: '/p',
          workDir: '/p/.meld-a11y-probe',
          writeFile: () => {},
          exec,
        },
      ),
    ).toThrow(
      'eslint lint exited 2: ESLint configuration in --config file is invalid.',
    );
  });
});
