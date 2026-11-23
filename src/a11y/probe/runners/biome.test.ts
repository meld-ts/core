import { describe, expect, test } from 'bun:test';

import type { ExecFn } from '../exec';
import type { Fixture } from '../fixtures';
import { parseBiome, runBiome } from './biome';

/**
 * 输出形状与消息录自 biome 2.5.0 / 2.6.8 的真实运行（--reporter=json）：
 * required 消息只含 role（缺失属性清单在 footer，JSON 不输出，advices 恒为空）；
 * unsupported 消息不含 role，靠诊断的文件与行号回查 fixture 那一行的 role。
 * Task 7 必须用 lab 的最新 biome 复核，若新版把 footer 清单输出到 advices，
 * 应升级解析器读取它。
 */
const RAW = JSON.stringify({
  summary: { errors: 2, warnings: 0, infos: 0 },
  diagnostics: [
    {
      severity: 'error',
      message:
        'The element with the checkbox ARIA role does not have the required ARIA attributes.',
      category: 'lint/a11y/useAriaPropsForRole',
      location: {
        path: '.meld-a11y-probe/fixtures/required.jsx',
        start: { line: 1, column: 29 },
        end: { line: 1, column: 44 },
      },
      advices: [],
    },
    {
      severity: 'error',
      message:
        "The ARIA attribute 'aria-valuenow' is not supported by this element.",
      category: 'lint/a11y/useAriaPropsSupportedByRole',
      location: {
        path: '.meld-a11y-probe/fixtures/supported-0.jsx',
        start: { line: 2, column: 24 },
        end: { line: 2, column: 76 },
      },
      advices: [],
    },
    {
      severity: 'error',
      message: 'unrelated rule must be ignored',
      category: 'lint/a11y/useSemanticElements',
      location: {
        path: '.meld-a11y-probe/fixtures/required.jsx',
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 },
      },
      advices: [],
    },
  ],
  command: 'lint',
});

const fixtures: readonly Fixture[] = [
  {
    name: 'required',
    code: 'export const F0 = () => <div role="checkbox" />;',
  },
  {
    name: 'supported-0',
    code: [
      'export const F0 = () => <div role="switch" aria-checked={true} />;',
      'export const F1 = () => <div role="switch" aria-valuenow={1} />;',
    ].join('\n'),
  },
];

describe('parseBiome', () => {
  test('reads role from messages and location lines, ignoring other rules', () => {
    expect(parseBiome(RAW, fixtures)).toEqual({
      missing: [{ role: 'checkbox', props: [] }],
      unsupported: [{ role: 'switch', prop: 'aria-valuenow' }],
    });
  });

  test('returns an empty report when nothing fired', () => {
    expect(parseBiome('{"diagnostics":[]}', fixtures)).toEqual({
      missing: [],
      unsupported: [],
    });
  });

  test('fails when a diagnostic line cannot be resolved to a role', () => {
    const raw = JSON.stringify({
      diagnostics: [
        {
          category: 'lint/a11y/useAriaPropsSupportedByRole',
          message:
            "The ARIA attribute 'aria-valuenow' is not supported by this element.",
          location: {
            path: '.meld-a11y-probe/fixtures/other.jsx',
            start: { line: 1 },
          },
        },
      ],
    });
    expect(() => parseBiome(raw, fixtures)).toThrow(
      'cannot resolve role at .meld-a11y-probe/fixtures/other.jsx:1',
    );
  });

  test('fails when a whitelisted rule carries an unknown message', () => {
    const raw = JSON.stringify({
      diagnostics: [
        {
          category: 'lint/a11y/useAriaPropsForRole',
          message: 'The element with the checkbox ARIA role is missing props.',
          location: {
            path: '.meld-a11y-probe/fixtures/required.jsx',
            start: { line: 1 },
          },
        },
      ],
    });
    expect(() => parseBiome(raw, fixtures)).toThrow(
      'biome lint/a11y/useAriaPropsForRole: unrecognized message: The element with the checkbox ARIA role is missing props.',
    );
  });
});

describe('runBiome', () => {
  test('writes config plus fixtures and lints the fixtures dir', () => {
    const writes = new Map<string, string>();
    const commands: string[][] = [];
    const exec: ExecFn = (cmd, opts) => {
      commands.push([...cmd]);
      expect(opts.cwd).toBe('/p');
      return { code: 1, stdout: RAW, stderr: '' };
    };
    const report = runBiome(fixtures, {
      bin: ['biome-bin'],
      cwd: '/p',
      workDir: '/p/.meld-a11y-probe',
      writeFile: (path, content) => writes.set(path, content),
      exec,
    });
    expect([...writes.keys()].sort()).toEqual([
      '/p/.meld-a11y-probe/config/biome/biome.json',
      '/p/.meld-a11y-probe/fixtures/required.jsx',
      '/p/.meld-a11y-probe/fixtures/supported-0.jsx',
    ]);
    expect(writes.get('/p/.meld-a11y-probe/config/biome/biome.json')).toContain(
      '"useAriaPropsForRole": "error"',
    );
    expect(commands).toEqual([
      [
        'biome-bin',
        'lint',
        '--config-path=/p/.meld-a11y-probe/config/biome',
        '--reporter=json',
        '/p/.meld-a11y-probe/fixtures',
      ],
    ]);
    expect(report.unsupported).toEqual([
      { role: 'switch', prop: 'aria-valuenow' },
    ]);
  });
});
