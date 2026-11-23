import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProbeRunner } from '../a11y/probe';
import { main, nodeDeps, parseProbeArgs, runProbe } from './meld';
import type { ProbeDeps } from './meld';

describe('parseProbeArgs', () => {
  test('defaults', () => {
    expect(parseProbeArgs([])).toEqual({ keep: false });
  });

  test('parses lint list, out and keep', () => {
    expect(
      parseProbeArgs(['--lint=biome,oxlint', '--out=./x.d.ts', '--keep']),
    ).toEqual({ lint: ['biome', 'oxlint'], out: './x.d.ts', keep: true });
  });

  test('rejects unknown arguments', () => {
    expect(() => parseProbeArgs(['--lint', 'biome'])).toThrow(
      'unknown argument: --lint',
    );
  });

  test('rejects empty or unknown lint names', () => {
    expect(() => parseProbeArgs(['--lint='])).toThrow('empty --lint');
    expect(() => parseProbeArgs(['--lint=biom'])).toThrow(
      "unknown lint 'biom'",
    );
  });

  test('rejects an empty --out', () => {
    expect(() => parseProbeArgs(['--out='])).toThrow('empty --out');
  });

  // --help 由 main 统一识别，parse 仍严格拒绝，不认识求助
  test('rejects --help (recognized by main, not by parse)', () => {
    expect(() => parseProbeArgs(['--help'])).toThrow(
      'unknown argument: --help',
    );
  });
});

/**
 * 假 runner：三个自检 role 没带 aria-checked 就报缺失，其余 role 不报。
 * 满足探针的基线 / 自检 / 不变量，又不引入整套 role 模型。
 * 记录每次调用的 bin，供用例断言模式标志确实流进了 runner。
 */
const fakeRunnerOf = (bins: Array<readonly string[]>): ProbeRunner => {
  return (fixtures, opts) => {
    bins.push(opts.bin);
    const missing: Array<{ role: string; props: string[] }> = [];
    for (const fixture of fixtures) {
      for (const line of fixture.code.split('\n')) {
        const role = line.match(/role="([^"]+)"/)?.[1];
        if (role !== 'checkbox' && role !== 'slider' && role !== 'switch') {
          continue;
        }
        if (line.includes(' aria-checked')) continue;
        missing.push({ role, props: ['aria-checked'] });
      }
    }
    return { missing, unsupported: [] };
  };
};

interface FakeDepsOpts {
  /** tsconfig.json 内容；省略 = 读不到（无 tsconfig 的项目） */
  readonly tsconfig?: unknown;
  readonly devDependencies?: Record<string, string>;
  /** bun 内置 lint 的可用性与模式；省略 = 这个 bun 没有 lint */
  readonly bun?: 'oxlint' | 'defaults';
}

interface FakeEnv {
  readonly deps: ProbeDeps;
  readonly writes: Map<string, string>;
  readonly warns: string[];
  readonly runnerBins: Array<readonly string[]>;
}

const fakeDeps = (opts: FakeDepsOpts = {}): FakeEnv => {
  const writes = new Map<string, string>();
  const warns: string[] = [];
  const runnerBins: Array<readonly string[]> = [];
  const runner = fakeRunnerOf(runnerBins);
  const deps: ProbeDeps = {
    exec: (cmd) => {
      if (cmd[0] === process.execPath && cmd[1] === 'lint') {
        // lint 探针一律带 --no-script（防 lint 脚本劫持）；不带按未知
        // 命令直接失败。
        if (!cmd.includes('--no-script')) {
          throw new Error(
            `bun lint probe without --no-script: ${cmd.join(' ')}`,
          );
        }
        if (cmd.includes('--help')) {
          return {
            code: opts.bun === undefined ? 1 : 0,
            stdout: '',
            stderr: opts.bun === undefined ? 'no lint' : '',
          };
        }
        if (cmd.includes('--jsx-a11y-plugin')) {
          // 模式探针：defaults 模式拒绝 oxlint 标志，oxlint 模式接受
          return opts.bun === 'oxlint'
            ? { code: 1, stdout: '{ "diagnostics": [] }', stderr: '' }
            : {
                code: 2,
                stdout: '',
                stderr:
                  'error: --jsx-a11y-plugin is an oxlint flag and has no effect here',
              };
        }
      }
      if (cmd[0] === process.execPath && cmd[1] === '--version') {
        return { code: 0, stdout: '1.4.4\n', stderr: '' };
      }
      if (cmd[0]?.endsWith('biome') && cmd[1] === '--version') {
        return { code: 0, stdout: '2.6.8\n', stderr: '' };
      }
      throw new Error(`unexpected exec: ${cmd.join(' ')}`);
    },
    readJson: (path) => {
      if (path.endsWith('tsconfig.json')) {
        if (opts.tsconfig === undefined) {
          throw new Error(`ENOENT: no such file: ${path}`);
        }
        return opts.tsconfig;
      }
      if (path.endsWith('package.json')) {
        return {
          devDependencies: opts.devDependencies ?? {
            '@biomejs/biome': '2.6.8',
          },
        };
      }
      throw new Error(`unexpected read: ${path}`);
    },
    exists: (path) => path.endsWith('node_modules/.bin/biome'),
    write: (path, content) => {
      writes.set(path, content);
    },
    rm: () => {},
    warn: (message) => {
      warns.push(message);
    },
    runners: {
      eslint: runner,
      oxlint: runner,
      biome: runner,
      bun: runner,
    },
  };
  return { deps, writes, warns, runnerBins };
};

describe('runProbe', () => {
  test('writes the override file and warns when tsconfig does not include it', () => {
    const { deps, writes, warns } = fakeDeps({
      tsconfig: { include: ['src/**/*.ts'] },
    });
    const target = runProbe({ cwd: '/p', lint: ['biome'], keep: false, deps });
    expect(target).toBe('/p/a11y-lints.generated.d.ts');
    const content = writes.get(target);
    expect(content?.split('\n')[0]).toBe('export {};');
    expect(content).toContain("declare module '@meld-ts/core/a11y' {");
    expect(content).toContain('interface A11yLintOverrides {');
    expect(content).toContain("version: '2.6.8'");
    expect(warns).toEqual([
      'warning: /p/a11y-lints.generated.d.ts is not in tsconfig include (not-include); the override will not take effect',
    ]);
  });

  test('does not warn when tsconfig covers the file', () => {
    const { deps, writes, warns } = fakeDeps({
      tsconfig: { include: ['**/*.d.ts'] },
    });
    const target = runProbe({ cwd: '/p', lint: ['biome'], keep: false, deps });
    expect(writes.has(target)).toBe(true);
    expect(warns).toEqual([]);
  });

  test('resolves a relative --out against cwd', () => {
    const { deps, writes } = fakeDeps({ tsconfig: {} });
    const target = runProbe({
      cwd: '/p',
      out: 'gen/a11y.d.ts',
      keep: true,
      deps,
    });
    expect(target).toBe('/p/gen/a11y.d.ts');
    expect(writes.has('/p/gen/a11y.d.ts')).toBe(true);
  });

  test('warns instead of failing when tsconfig.json is unreadable', () => {
    const { deps, warns } = fakeDeps();
    const target = runProbe({ cwd: '/p', lint: ['biome'], keep: false, deps });
    expect(target).toBe('/p/a11y-lints.generated.d.ts');
    expect(warns[0]).toContain('cannot read tsconfig.json');
  });

  test('errors on a wanted lint that is not installed', () => {
    const { deps } = fakeDeps({ tsconfig: {}, devDependencies: {} });
    expect(() =>
      runProbe({ cwd: '/p', lint: ['biome', 'oxlint'], keep: false, deps }),
    ).toThrow('lint not installed: biome, oxlint');
  });

  test('errors when nothing is detected at all', () => {
    const { deps } = fakeDeps({ tsconfig: {}, devDependencies: {} });
    expect(() => runProbe({ cwd: '/p', keep: false, deps })).toThrow(
      'no supported lint found',
    );
  });

  test('probes the running bun in defaults mode without an oxlint marker', () => {
    const { deps, writes, runnerBins } = fakeDeps({
      tsconfig: {},
      devDependencies: {},
      bun: 'defaults',
    });
    const target = runProbe({ cwd: '/p', lint: ['bun'], keep: false, deps });
    expect(target).toBe('/p/a11y-lints.generated.d.ts');
    const content = writes.get(target);
    expect(content).toContain('bun: {');
    expect(content).toContain("version: '1.4.4'");
    expect(runnerBins.at(-1)).toEqual([
      process.execPath,
      'lint',
      '--no-script',
    ]);
  });

  test('probes the running bun with oxlint-mode flags when a marker exists', () => {
    const { deps, runnerBins } = fakeDeps({
      tsconfig: {},
      devDependencies: {},
      bun: 'oxlint',
    });
    runProbe({ cwd: '/p', lint: ['bun'], keep: false, deps });
    expect(runnerBins.at(-1)).toEqual([
      process.execPath,
      'lint',
      '--no-script',
      '--jsx-a11y-plugin',
    ]);
  });
});

describe('main', () => {
  test('non-probe routes print usage and return 1', async () => {
    expect(await main([])).toBe(1);
    expect(await main(['probe'])).toBe(1);
    expect(await main(['a11y'])).toBe(1);
    expect(await main(['a11y', 'sync'])).toBe(1);
  });

  test('probe writes the override file and returns 0', async () => {
    const { deps } = fakeDeps({ tsconfig: {} });
    expect(
      await main(['a11y', 'probe', '--lint=biome'], { cwd: '/p', ...deps }),
    ).toBe(0);
  });

  test('help flags print usage to stdout and return 0', async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (message: string) => {
      logs.push(message);
    };
    try {
      expect(await main(['--help'])).toBe(0);
      expect(await main(['-h'])).toBe(0);
      expect(await main(['a11y', 'probe', '--help'])).toBe(0);
    } finally {
      console.log = original;
    }
    expect(logs).toHaveLength(3);
    expect(logs.every((log) => log.includes('Usage:'))).toBe(true);
  });

  test('invalid probe args print message and usage, return 1', async () => {
    expect(await main(['a11y', 'probe', '--keep=1'])).toBe(1);
    expect(await main(['a11y', 'probe', '--lint=biom'])).toBe(1);
    expect(await main(['a11y', 'probe', '--out='])).toBe(1);
  });

  test('probe failure prints the error and returns 1', async () => {
    const { deps } = fakeDeps({ tsconfig: {}, devDependencies: {} });
    expect(await main(['a11y', 'probe'], { cwd: '/p', ...deps })).toBe(1);
  });
});

describe('nodeDeps', () => {
  test('write creates parent dirs, readJson parses and rm removes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meld-a11y-'));
    try {
      nodeDeps.write(`${dir}/a/b/f.txt`, 'hi');
      expect(existsSync(`${dir}/a/b/f.txt`)).toBe(true);
      writeFileSync(join(dir, 'pkg.json'), '{"v":1}');
      expect(nodeDeps.readJson(join(dir, 'pkg.json'))).toEqual({ v: 1 });
      nodeDeps.rm(`${dir}/a`);
      expect(existsSync(`${dir}/a`)).toBe(false);
      // rm 不因路径不存在而报错
      nodeDeps.rm(`${dir}/a`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exec spawns a command and warn forwards to console.warn', () => {
    expect(
      nodeDeps.exec([process.execPath, '--version'], { cwd: process.cwd() })
        .code,
    ).toBe(0);
    const original = console.warn;
    const seen: string[] = [];
    console.warn = (message: string) => {
      seen.push(message);
    };
    try {
      nodeDeps.warn('boom');
    } finally {
      console.warn = original;
    }
    expect(seen).toEqual(['boom']);
  });
});
