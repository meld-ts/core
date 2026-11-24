import { describe, expect, test } from 'bun:test';

import { checkTsconfigIncludes } from './tsconfig-check';

const tsconfigOf =
  (raw: unknown) =>
  (path: string): unknown => {
    if (path.endsWith('tsconfig.json')) return raw;
    throw new Error(`unexpected read: ${path}`);
  };

describe('checkTsconfigIncludes', () => {
  test('accepts a file matched by include', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({
          include: ['src/**/*.ts', 'a11y-lints.generated.d.ts'],
        }),
      }),
    ).toEqual({ included: true, reason: 'include' });
  });

  test('reports exclusion', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({
          include: ['src/**/*.ts'],
          exclude: ['a11y-lints.generated.d.ts'],
        }),
      }).included,
    ).toBe(false);
  });

  test('a src-only glob or directory does not cover a root-level file', () => {
    const readJson = tsconfigOf({ include: ['src', 'src/**/*.ts'] });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson,
      }),
    ).toEqual({ included: false, reason: 'not-include' });
  });

  test('star-star globs and directory includes match nested files', () => {
    const glob = tsconfigOf({ include: ['**/*.d.ts'] });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: glob,
      }),
    ).toEqual({ included: true, reason: 'include' });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/gen/a11y-lints.generated.d.ts',
        readJson: glob,
      }),
    ).toEqual({ included: true, reason: 'include' });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/src/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['src'] }),
      }),
    ).toEqual({ included: true, reason: 'include' });
    // 尾部 `/**` 覆盖目录下任意深度的文件
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/src/gen/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['src/**'] }),
      }),
    ).toEqual({ included: true, reason: 'include' });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/src/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['src/**'] }),
      }),
    ).toEqual({ included: true, reason: 'include' });
    // `**` 段匹配零段：src/**/*.ts 也覆盖 src 直下的文件
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/src/a.d.ts',
        readJson: tsconfigOf({ include: ['src/**/*.d.ts'] }),
      }),
    ).toEqual({ included: true, reason: 'include' });
  });

  test('absent include compiles the whole directory by tsc defaults', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({}),
      }),
    ).toEqual({ included: true, reason: 'default' });
  });

  test('absent include with a files list only covers the listed files', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ files: ['src/index.ts'] }),
      }),
    ).toEqual({ included: false, reason: 'not-files' });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ files: ['a11y-lints.generated.d.ts'] }),
      }),
    ).toEqual({ included: true, reason: 'files' });
  });

  test('an extends-only tsconfig fails safe as not judgeable', () => {
    // extends 链上游的 include/files 这里看不到：本文件没有可判的依据时
    // 宁可按未包含告警（fail-safe），也不静默按 default 放行
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ extends: '../tsconfig.base.json' }),
      }),
    ).toEqual({ included: false, reason: 'extends' });
  });

  test('local include and files still decide when extends is present', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({
          extends: '../tsconfig.base.json',
          include: ['a11y-lints.generated.d.ts'],
        }),
      }),
    ).toEqual({ included: true, reason: 'include' });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({
          extends: '../tsconfig.base.json',
          files: ['a11y-lints.generated.d.ts'],
        }),
      }),
    ).toEqual({ included: true, reason: 'files' });
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({
          extends: '../tsconfig.base.json',
          files: ['src/index.ts'],
        }),
      }),
    ).toEqual({ included: false, reason: 'not-files' });
  });

  test('files and include coexist as a union', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/p/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({
          files: ['a11y-lints.generated.d.ts'],
          include: ['src/**/*.ts'],
        }),
      }),
    ).toEqual({ included: true, reason: 'files' });
  });

  test('an out path outside the tsconfig directory is reported', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/other/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['**/*.d.ts'] }),
      }),
    ).toEqual({ included: false, reason: 'outside' });
  });

  test('windows-style backslash paths match include patterns', () => {
    expect(
      checkTsconfigIncludes({
        cwd: 'C:\\p',
        outPath: 'C:\\p\\a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['a11y-lints.generated.d.ts'] }),
      }),
    ).toEqual({ included: true, reason: 'include' });
    // 嵌套 --out（Windows 上 resolve 产出反斜杠路径）也要对得上 POSIX glob
    expect(
      checkTsconfigIncludes({
        cwd: 'C:\\p',
        outPath: 'C:\\p\\sub\\a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['sub/**/*.d.ts'] }),
      }),
    ).toEqual({ included: true, reason: 'include' });
  });

  test('a windows-style backslash path outside cwd is reported', () => {
    expect(
      checkTsconfigIncludes({
        cwd: 'C:\\p',
        outPath: 'C:\\q\\a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['**/*.d.ts'] }),
      }),
    ).toEqual({ included: false, reason: 'outside' });
  });
});
