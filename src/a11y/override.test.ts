import { describe, expect, test } from 'bun:test';

const root = new URL('../..', import.meta.url).pathname;

/**
 * 子进程跑 tsc：fixture 在独立 tsconfig 下编译，
 * 避免坏重载污染主项目的 ts-check。
 */
const tsc = (fixture: string): { exitCode: number; output: string } => {
  const proc = Bun.spawnSync(['bunx', 'tsc', '-p', `test/a11y/${fixture}`], {
    cwd: root,
  });
  // tsc 5.x 的诊断可能写 stdout 也可能写 stderr，合并后断言
  return {
    exitCode: proc.exitCode,
    output: proc.stdout.toString() + proc.stderr.toString(),
  };
};

describe('A11yLintOverrides', () => {
  test('valid override takes effect and compiles', () => {
    const { exitCode, output } = tsc('override-good');
    expect({ exitCode, output }).toEqual({ exitCode: 0, output: '' });
  });

  test('lint name union intersects supported sets of merged tables', () => {
    const { exitCode, output } = tsc('lint-union');
    expect({ exitCode, output }).toEqual({ exitCode: 0, output: '' });
  });

  test('unknown override key errors at createA11y with readable message', () => {
    const { exitCode, output } = tsc('override-unknown');
    expect(exitCode).not.toBe(0);
    expect(output).toContain('Unknown lint name in A11yLintOverrides');
  });

  test('invalid override shape errors at createA11y with readable message', () => {
    const { exitCode, output } = tsc('override-shape');
    expect(exitCode).not.toBe(0);
    expect(output).toContain(
      'Invalid A11yLintOverrides shape, rerun meld a11y probe',
    );
  });
});
