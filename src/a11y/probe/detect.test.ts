import { describe, expect, test } from 'bun:test';

import { detectLints } from './detect';

const fakeJson =
  (map: Record<string, unknown>) =>
  (path: string): unknown => {
    // findLast：多个键同为后缀时，写在后面的长键（更具体）胜出。
    const hit = Object.entries(map).findLast(([k]) => path.endsWith(k));
    if (!hit) throw new Error(`unexpected read: ${path}`);
    return hit[1];
  };

describe('detectLints', () => {
  test('finds installed lints and their versions', () => {
    const exec = (cmd: readonly string[]) => {
      // 机器上有 bun（运行时就是 bun）也不该探：默认一发 bun 命令都不能有
      if (cmd[0] === process.execPath) {
        throw new Error(`bun must not be probed by default: ${cmd.join(' ')}`);
      }
      if (cmd[0]?.endsWith('biome'))
        return { code: 0, stdout: '2.6.8', stderr: '' };
      if (cmd[0]?.endsWith('oxlint'))
        return { code: 0, stdout: '1.94.0', stderr: '' };
      throw new Error(`unexpected exec: ${cmd[0]}`);
    };
    const readJson = fakeJson({
      'package.json': {
        devDependencies: {
          '@biomejs/biome': '2.6.8',
          oxlint: '1.94.0',
        },
      },
      'eslint-plugin-jsx-a11y/package.json': { version: '6.10.2' },
    });
    const detected = detectLints({
      cwd: '/p',
      exec,
      readJson,
      exists: (p: string) => p.includes('node_modules/.bin/'),
    });
    expect(detected.map((d) => [d.name, d.version])).toEqual([
      ['biome', '2.6.8'],
      ['oxlint', '1.94.0'],
    ]);
  });

  test('skips lints that are not installed', () => {
    const detected = detectLints({
      cwd: '/p',
      exec: () => {
        throw new Error('exec must not be called');
      },
      readJson: fakeJson({ 'package.json': { devDependencies: {} } }),
      exists: () => false,
    });
    expect(detected).toEqual([]);
  });

  test('reads eslint version from the jsx-a11y plugin', () => {
    const detected = detectLints({
      cwd: '/p',
      wanted: ['eslint'],
      exec: () => {
        throw new Error('exec must not be called');
      },
      readJson: fakeJson({
        'package.json': {
          devDependencies: {
            eslint: '9.42.0',
            'eslint-plugin-jsx-a11y': '6.10.2',
          },
        },
        'eslint-plugin-jsx-a11y/package.json': { version: '6.10.2' },
      }),
      exists: (p: string) => p.endsWith('node_modules/.bin/eslint'),
    });
    expect(detected.map((d) => [d.name, d.version])).toEqual([
      ['eslint', '6.10.2'],
    ]);
  });

  test('restricts detection to wanted lints', () => {
    const detected = detectLints({
      cwd: '/p',
      exec: (cmd: readonly string[]) => {
        if (cmd[0]?.endsWith('biome'))
          return { code: 0, stdout: '2.6.8', stderr: '' };
        throw new Error(`unexpected exec: ${cmd[0]}`);
      },
      readJson: fakeJson({
        'package.json': {
          devDependencies: { '@biomejs/biome': '2.6.8', oxlint: '1.94.0' },
        },
      }),
      exists: () => true,
      wanted: ['biome'],
    });
    expect(detected.map((d) => d.name)).toEqual(['biome']);
  });

  test('extracts the semver from Version-prefixed output', () => {
    const detected = detectLints({
      cwd: '/p',
      exec: (cmd: readonly string[]) => {
        // biome-only 的 package.json 默认只报 biome；bun 一发都不能探
        if (cmd[0] === process.execPath) {
          throw new Error(
            `bun must not be probed by default: ${cmd.join(' ')}`,
          );
        }
        if (cmd[0]?.endsWith('biome'))
          return { code: 0, stdout: 'Version: 2.5.0\n', stderr: '' };
        throw new Error(`unexpected exec: ${cmd[0]}`);
      },
      readJson: fakeJson({
        'package.json': {
          devDependencies: { '@biomejs/biome': '2.5.0' },
        },
      }),
      exists: () => true,
    });
    expect(detected.map((d) => [d.name, d.version])).toEqual([
      ['biome', '2.5.0'],
    ]);
  });

  test('fails when --version exits non-zero', () => {
    expect(() =>
      detectLints({
        cwd: '/p',
        exec: () => ({ code: 1, stdout: '', stderr: 'boom' }),
        readJson: fakeJson({
          'package.json': {
            devDependencies: { '@biomejs/biome': '2.5.0' },
          },
        }),
        exists: () => true,
      }),
    ).toThrow('biome --version exited with code 1: boom');
  });

  test('fails when no semver appears in --version output', () => {
    expect(() =>
      detectLints({
        cwd: '/p',
        exec: () => ({ code: 0, stdout: 'built from source\n', stderr: '' }),
        readJson: fakeJson({
          'package.json': {
            devDependencies: { '@biomejs/biome': '2.5.0' },
          },
        }),
        exists: () => true,
      }),
    ).toThrow('biome --version output has no semver: built from source');
  });

  // bun 探活序列：help → 模式探针（这个 cwd 是否接受 --jsx-a11y-plugin）→
  // --version。help 未通过就不该走到模式探针（fake 对多余命令直接抛错）。
  const bunExec =
    (helpCode: number, oxlintMode: boolean) => (cmd: readonly string[]) => {
      if (cmd[0] === process.execPath && cmd[1] === 'lint') {
        // lint 探针一律带 --no-script：不带时 bun 会转去执行项目的
        // lint 脚本（exit 0、无 oxlint 拒绝语），探不出真实模式。
        if (!cmd.includes('--no-script')) {
          throw new Error(
            `bun lint probe without --no-script: ${cmd.join(' ')}`,
          );
        }
        if (cmd.includes('--help')) {
          return {
            code: helpCode,
            stdout: '',
            stderr: helpCode === 0 ? '' : 'no lint',
          };
        }
        if (cmd.includes('--jsx-a11y-plugin')) {
          return oxlintMode
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
      throw new Error(`unexpected exec: ${cmd.join(' ')}`);
    };

  test('detects the running bun with oxlint-mode flags when a marker exists', () => {
    const detected = detectLints({
      cwd: '/p',
      exec: bunExec(0, true),
      readJson: fakeJson({ 'package.json': {} }),
      exists: () => false,
      wanted: ['bun'],
    });
    expect(detected).toEqual([
      {
        name: 'bun',
        version: '1.4.4',
        bin: [process.execPath, 'lint', '--no-script', '--jsx-a11y-plugin'],
      },
    ]);
  });

  test('detects the running bun with defaults flags without an oxlint marker', () => {
    const detected = detectLints({
      cwd: '/p',
      exec: bunExec(0, false),
      readJson: fakeJson({ 'package.json': {} }),
      exists: () => false,
      wanted: ['bun'],
    });
    expect(detected).toEqual([
      {
        name: 'bun',
        version: '1.4.4',
        bin: [process.execPath, 'lint', '--no-script'],
      },
    ]);
  });

  test('judges defaults mode even when package.json defines a lint script', () => {
    // bun lint 不带 --no-script 时，带 lint 脚本的项目里 bun 会转去执行
    // 脚本：exit 0、stderr 无 oxlint 拒绝语，被误判成 oxlint 模式。模式
    // 探针必须带 --no-script 才测得到内置 lint 的真实行为。
    const detected = detectLints({
      cwd: '/p',
      exec: (cmd: readonly string[]) => {
        if (cmd[0] === process.execPath && cmd[1] === 'lint') {
          if (cmd.includes('--help')) {
            return { code: 0, stdout: '', stderr: '' };
          }
          if (cmd.includes('--no-script')) {
            // 内置 lint 亲自应答：defaults 模式拒绝插件标志
            return {
              code: 2,
              stdout: '',
              stderr:
                'error: --jsx-a11y-plugin is an oxlint flag and has no effect here',
            };
          }
          // 不带 --no-script：bun 转去执行项目 lint 脚本（劫持输出）
          return { code: 0, stdout: '$ biome lint ./src\n', stderr: '' };
        }
        if (cmd[0] === process.execPath && cmd[1] === '--version') {
          return { code: 0, stdout: '1.4.4\n', stderr: '' };
        }
        throw new Error(`unexpected exec: ${cmd.join(' ')}`);
      },
      readJson: fakeJson({
        'package.json': { scripts: { lint: 'biome lint ./src' } },
      }),
      exists: () => false,
      wanted: ['bun'],
    });
    expect(detected).toEqual([
      {
        name: 'bun',
        version: '1.4.4',
        bin: [process.execPath, 'lint', '--no-script'],
      },
    ]);
  });

  test('returns only package.json lints by default on a machine with bun', () => {
    // 设计 §6：不传 --lint 只读 package.json，装了哪些 lint 就探哪些。
    // bun 不在 package.json 里（是当前运行时），机器上有也不探——
    // biome-only 的项目默认只报 biome，bun 要 --lint=bun 点名。
    const detected = detectLints({
      cwd: '/p',
      exec: (cmd: readonly string[]) => {
        if (cmd[0]?.endsWith('biome')) {
          return { code: 0, stdout: '2.6.8', stderr: '' };
        }
        // bun 的任何探活命令一发都不该有：发了就炸，证明默认不探 bun
        throw new Error(`bun must not be probed by default: ${cmd.join(' ')}`);
      },
      readJson: fakeJson({
        'package.json': { devDependencies: { '@biomejs/biome': '2.6.8' } },
      }),
      exists: (p: string) => p.endsWith('node_modules/.bin/biome'),
    });
    expect(detected.map((d) => d.name)).toEqual(['biome']);
  });

  test('fails with a readable error when bun lint is wanted but unavailable', () => {
    expect(() =>
      detectLints({
        cwd: '/p',
        exec: bunExec(1, true),
        readJson: fakeJson({ 'package.json': {} }),
        exists: () => false,
        wanted: ['bun'],
      }),
    ).toThrow('bun lint is not available in this bun; upgrade bun or omit bun');
  });
});
