import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

// Windows 下 URL.pathname 是 /C:/... 形态，不能当路径用
const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * 子进程跑 tsc：fixture 在独立 tsconfig 下编译，
 * 避免坏重载污染主项目的 ts-check。
 * 经当前 Bun 可执行文件的 x 子命令调 tsc，不依赖 PATH 上的 bunx。
 */
const tsc = (fixture: string): { exitCode: number; output: string } => {
  const proc = Bun.spawnSync(
    [process.execPath, 'x', 'tsc', '-p', `test/a11y/${fixture}`],
    { cwd: root },
  );
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
      'Invalid A11yLintOverrides shape, rerun meld-ts a11y probe',
    );
  });

  test('union-typed override value errors at createA11y with readable message', () => {
    const { exitCode, output } = tsc('override-union');
    expect(exitCode).not.toBe(0);
    expect(output).toContain(
      'Invalid A11yLintOverrides shape, rerun meld-ts a11y probe',
    );
  });

  test('union override falls back to builtin via direct A11yOf', () => {
    const { exitCode, output } = tsc('override-union-direct');
    expect({ exitCode, output }).toEqual({ exitCode: 0, output: '' });
  });
});
