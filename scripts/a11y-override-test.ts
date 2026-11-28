/**
 * A11yLintOverrides 类型契约检查（pr-check.yml / version-bump.yml 显式跑）。
 *
 * 为什么是 script 而不是 .test.ts：每个用例起一个 tsc 子进程编译
 * scripts/tests/a11y/ 下的 fixture，是重进程的类型级契约检查，不属于 src/ 单元
 * 测试（AGENTS「测试」第 6/7 条）；混进 bun test 会拖慢单测。
 *
 * 契约：
 * - 合法重载生效且干净编译（override-good）；
 * - lint 名字并集与合并表支持集相交（lint-union）；
 * - 未知 key / 非法形状 / union 值在 createA11y 报可读错误；
 * - union 值经 A11yOf 直接推导回退内置表（override-union-direct）。
 *
 * fixture 直接 import src/a11y/index.ts 源码，不依赖构建产物。
 */

import { join, resolve } from 'node:path';
import { nodeExec } from '../bin/a11y-probe/exec';

const root = resolve(import.meta.dir, '..');

const log = (msg: string): void => {
  console.log(`[a11y-override-test] ${msg}`);
};

const failures: string[] = [];

const expect = (
  ok: boolean,
  label: string,
  okNote: string,
  detail: string,
): void => {
  if (ok) {
    log(`PASS ${label} (${okNote})`);
  } else {
    failures.push(label);
    console.error(`[a11y-override-test] FAIL ${label}: ${detail}`);
  }
};

// typedoc 要求 TS ≤ 6，typescript 留在 5.9.3；这里用别名装的 TS 7，快好几倍
const tsc7 = join(root, 'node_modules/typescript7/bin/tsc');

/**
 * 子进程跑 tsc：fixture 在独立 tsconfig 下编译，避免坏重载污染主项目
 * 的 ts-check。经当前 Bun 可执行文件调 tsc，不依赖 PATH 上的 bunx。
 * tsc 5.x 的诊断可能写 stdout 也可能写 stderr，合并后断言。
 */
const tsc = (fixture: string): { code: number; output: string } => {
  const r = nodeExec(
    [process.execPath, tsc7, '-p', `scripts/tests/a11y/${fixture}`],
    { cwd: root },
  );
  return { code: r.code, output: `${r.stdout}${r.stderr}` };
};

const started = Date.now();

log('override-good: valid override takes effect and compiles');
{
  const r = tsc('override-good');
  expect(
    r.code === 0 && r.output === '',
    'valid override takes effect and compiles',
    `tsc exit ${r.code}, clean output`,
    `tsc exited ${r.code}: ${r.output}`,
  );
}

log('lint-union: lint name union intersects supported sets of merged tables');
{
  const r = tsc('lint-union');
  expect(
    r.code === 0 && r.output === '',
    'lint name union intersects supported sets of merged tables',
    `tsc exit ${r.code}, clean output`,
    `tsc exited ${r.code}: ${r.output}`,
  );
}

log('override-unknown: unknown override key errors at createA11y');
{
  const r = tsc('override-unknown');
  expect(
    r.code !== 0 && r.output.includes('Unknown lint name in A11yLintOverrides'),
    'unknown override key errors at createA11y with readable message',
    `tsc exit ${r.code}, message found`,
    `tsc exited ${r.code}: ${r.output}`,
  );
}

log('override-shape: invalid override shape errors at createA11y');
{
  const r = tsc('override-shape');
  expect(
    r.code !== 0 &&
      r.output.includes(
        'Invalid A11yLintOverrides shape, rerun meld-ts a11y probe',
      ),
    'invalid override shape errors at createA11y with readable message',
    `tsc exit ${r.code}, message found`,
    `tsc exited ${r.code}: ${r.output}`,
  );
}

log('override-union: union-typed override value errors at createA11y');
{
  const r = tsc('override-union');
  expect(
    r.code !== 0 &&
      r.output.includes(
        'Invalid A11yLintOverrides shape, rerun meld-ts a11y probe',
      ),
    'union-typed override value errors at createA11y with readable message',
    `tsc exit ${r.code}, message found`,
    `tsc exited ${r.code}: ${r.output}`,
  );
}

log('override-union-direct: union override falls back to builtin via A11yOf');
{
  const r = tsc('override-union-direct');
  expect(
    r.code === 0 && r.output === '',
    'union override falls back to builtin via direct A11yOf',
    `tsc exit ${r.code}, clean output`,
    `tsc exited ${r.code}: ${r.output}`,
  );
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(
    `[a11y-override-test] ${failures.length} failure(s): ${failures.join(', ')}`,
  );
  console.error(`[a11y-override-test] FAILED (${secs}s)`);
  process.exitCode = 1;
} else {
  log(`all green (${secs}s)`);
}
