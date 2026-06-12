import { describe, expect, test } from 'bun:test';
import { createPathUtils } from './path';

// 测试用默认实例
const { join, purge } = createPathUtils({ separator: '/' });

// ── join ──────────────────────────────────────────────────

describe('join', () => {
  test('basic path concatenation', () => {
    expect(join('a', 'b', 'c')).toBe('a/b/c');
    expect(join('foo', 'bar')).toBe('foo/bar');
  });

  test('single path returns as-is after purge', () => {
    expect(join('hello')).toBe('hello');
    expect(join('/hello/')).toBe('hello');
  });

  test('empty or null inputs are ignored', () => {
    expect(join('a', '', 'b')).toBe('a/b');
    expect(join('a', null, 'b')).toBe('a/b');
    expect(join('a', undefined, 'b')).toBe('a/b');
    expect(join('', '', '')).toBe('');
    expect(join(null, undefined)).toBe('');
  });

  test('"." segments are skipped', () => {
    expect(join('a', '.', 'b')).toBe('a/b');
    expect(join('.', 'a', '.', 'b', '.')).toBe('a/b');
    expect(join('.', '.', '.')).toBe('');
  });

  test('".." goes up one level', () => {
    expect(join('a', 'b', '..')).toBe('a');
    expect(join('a', 'b', '..', 'c')).toBe('a/c');
    expect(join('a', '..')).toBe('');
    expect(join('a', '..', 'b')).toBe('b');
  });

  test('multiple ".." traverse multiple levels', () => {
    expect(join('a', 'b', 'c', '..', '..')).toBe('a');
    expect(join('a', 'b', 'c', '..', '..', 'd')).toBe('a/d');
  });

  test('".." beyond root is preserved as-is', () => {
    expect(join('a', '..', '..')).toBe('..');
    expect(join('..', 'a')).toBe('../a');
    expect(join('..', '..', 'a')).toBe('../../a');
  });

  test('consecutive ".." at root preserves both', () => {
    // a → .. → (empty) → .. → push .. → result: ..
    expect(join('a', '..', '..', '..')).toBe('../..');
  });

  test('path with embedded separators is split and handled', () => {
    expect(join('a/b', 'c')).toBe('a/b/c');
    expect(join('a', 'b/c/d')).toBe('a/b/c/d');
    expect(join('a/b', '../c')).toBe('a/c');
    expect(join('a/b/c', '../../d')).toBe('a/d');
  });

  test('absolute path input is normalized (no default safety)', () => {
    // 默认 dangerReplace 为空——路径遍历不被拦截
    expect(join('var/www', '../../../etc')).toBe('../etc');
    expect(join('/foo', 'bar')).toBe('foo/bar');
  });
});

// ── purge ─────────────────────────────────────────────────

describe('purge', () => {
  test('trims whitespace', () => {
    expect(purge('  hello  ')).toBe('hello');
    expect(purge('\t\n world \r')).toBe('world');
  });

  test('strips leading and trailing separators', () => {
    expect(purge('/a/b/')).toBe('a/b');
    expect(purge('///a///')).toBe('//a//');
    expect(purge('a/b')).toBe('a/b');
    expect(purge('/')).toBe('');
    expect(purge('//')).toBe('');
  });

  test('null and undefined return empty string', () => {
    expect(purge(null)).toBe('');
    expect(purge(undefined)).toBe('');
    expect(purge('')).toBe('');
  });
});

// ── separator ─────────────────────────────────────────────

describe('separator', () => {
  test('defaults to "/" when empty string given', () => {
    const { join } = createPathUtils({ separator: '' });
    expect(join('a', 'b')).toBe('a/b');
  });

  test('uses first character when multiple characters given', () => {
    const { join } = createPathUtils({ separator: '//' });
    expect(join('a', 'b')).toBe('a/b');
  });

  test('works with Windows backslash', () => {
    const { join } = createPathUtils({ separator: '\\' });
    expect(join('a', 'b', 'c')).toBe('a\\b\\c');
    expect(join('a', '..', 'b')).toBe('b');
    expect(join('a\\b', 'c')).toBe('a\\b\\c');
  });

  test('purge strips backslash separators', () => {
    const { purge } = createPathUtils({ separator: '\\' });
    expect(purge('\\a\\b\\')).toBe('a\\b');
  });
});

// ── dangerReplace ─────────────────────────────────────────

describe('dangerReplace', () => {
  test('callback is invoked with path and separator', () => {
    const { join } = createPathUtils({
      separator: '/',
      dangerReplace: (path) => `[${path}]`,
    });
    expect(join('a', 'b')).toBe('[a]/[b]');
  });

  test('can reject absolute paths', () => {
    const { join } = createPathUtils({
      separator: '/',
      dangerReplace: (path, sep) => {
        if (path.startsWith(sep)) throw new Error('absolute path not allowed');
        return path;
      },
    });
    expect(() => join('/etc/passwd')).toThrow('absolute path not allowed');
    expect(join('var', 'www')).toBe('var/www');
  });

  test('can strip all ".." segments', () => {
    const { join } = createPathUtils({
      separator: '/',
      dangerReplace: (path, sep) =>
        path
          .split(sep)
          .filter((s) => s !== '..')
          .join(sep),
    });
    expect(join('var/www', '../../../etc')).toBe('var/www/etc');
  });
});

// ── duplicateReplace ──────────────────────────────────────

describe('duplicateReplace', () => {
  test('can normalize consecutive separators', () => {
    const { purge } = createPathUtils({
      separator: '/',
      duplicateReplace: (path, sep) => {
        while (path.includes(sep + sep)) {
          path = path.replaceAll(sep + sep, sep);
        }
        return path;
      },
    });
    expect(purge('//a//b//')).toBe('a/b');
    expect(purge('a///b')).toBe('a/b');
  });
});

// ── edge cases ────────────────────────────────────────────

describe('edge cases', () => {
  test('join with only ".." segments', () => {
    expect(join('..', '..')).toBe('../..');
  });

  test('join results in empty string', () => {
    expect(join('.', '.', '.')).toBe('');
    expect(join('a', '..')).toBe('');
  });

  test('mix of . and .. and normal segments', () => {
    expect(join('a', '.', 'b', '..', 'c', '.', 'd')).toBe('a/c/d');
  });

  test('purge preserves inner separators', () => {
    expect(purge('a/b')).toBe('a/b');
    expect(purge('/a/b/')).toBe('a/b');
  });

  test('large number of path segments', () => {
    const segments = Array.from({ length: 100 }, (_, i) => `seg${i}`);
    expect(join(...segments)).toBe(segments.join('/'));
  });
});
