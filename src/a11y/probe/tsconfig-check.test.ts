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

  test('an out path outside the tsconfig directory is reported', () => {
    expect(
      checkTsconfigIncludes({
        cwd: '/p',
        outPath: '/other/a11y-lints.generated.d.ts',
        readJson: tsconfigOf({ include: ['**/*.d.ts'] }),
      }),
    ).toEqual({ included: false, reason: 'outside' });
  });
});
