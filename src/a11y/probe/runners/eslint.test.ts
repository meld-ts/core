import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import { parseEslint, runEslint } from './eslint';

/**
 * 消息按 eslint-plugin-jsx-a11y 6.x 源码的模板手写
 * （role-has-required-aria-props / role-supports-aria-props）。
 * Task 7 必须用 lab 录制的真实输出替换并复核解析器。
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
      unsupported: [{ role: 'switch', prop: 'aria-valuenow' }],
    });
  });

  test('returns an empty report when nothing fired', () => {
    expect(parseEslint('[]')).toEqual({ missing: [], unsupported: [] });
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
      '/p/.meld-a11y-probe/config/eslint/eslint.config.js',
      '/p/.meld-a11y-probe/fixtures/required.jsx',
    ]);
    expect(
      writes.get('/p/.meld-a11y-probe/config/eslint/eslint.config.js'),
    ).toContain("'jsx-a11y/role-has-required-aria-props': 'error'");
    expect(commands).toEqual([
      [
        'eslint-bin',
        '-c',
        '/p/.meld-a11y-probe/config/eslint/eslint.config.js',
        '-f',
        'json',
        '/p/.meld-a11y-probe/fixtures',
      ],
    ]);
    expect(report.missing).toEqual([
      { role: 'combobox', props: ['aria-expanded', 'aria-controls'] },
    ]);
  });
});
