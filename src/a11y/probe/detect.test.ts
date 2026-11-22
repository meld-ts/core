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
  // bun 分支的探活命令：`bun lint --help`；code !== 0 = 这个 bun 没有内置 lint
  const noBunLint = (cmd: readonly string[]) =>
    cmd[0] === process.execPath && cmd[1] === 'lint';

  test('finds installed lints and their versions', () => {
    const exec = (cmd: readonly string[]) => {
      if (noBunLint(cmd)) return { code: 1, stdout: '', stderr: 'no lint' };
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
      exec: (cmd: readonly string[]) =>
        noBunLint(cmd)
          ? { code: 1, stdout: '', stderr: 'no lint' }
          : { code: 0, stdout: '', stderr: '' },
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
        if (noBunLint(cmd)) return { code: 1, stdout: '', stderr: 'no lint' };
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
      if (
        cmd[0] === process.execPath &&
        cmd[1] === 'lint' &&
        cmd[2] === '--help'
      ) {
        return {
          code: helpCode,
          stdout: '',
          stderr: helpCode === 0 ? '' : 'no lint',
        };
      }
      if (
        cmd[0] === process.execPath &&
        cmd[1] === 'lint' &&
        cmd.includes('--jsx-a11y-plugin')
      ) {
        return oxlintMode
          ? { code: 1, stdout: '{ "diagnostics": [] }', stderr: '' }
          : {
              code: 2,
              stdout: '',
              stderr:
                'error: --jsx-a11y-plugin is an oxlint flag and has no effect here',
            };
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
    });
    expect(detected).toEqual([
      {
        name: 'bun',
        version: '1.4.4',
        bin: [process.execPath, 'lint', '--no-script'],
      },
    ]);
  });

  test('skips bun when its lint is unavailable and bun is not wanted', () => {
    const detected = detectLints({
      cwd: '/p',
      exec: bunExec(1, true),
      readJson: fakeJson({ 'package.json': {} }),
      exists: () => false,
    });
    expect(detected).toEqual([]);
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
