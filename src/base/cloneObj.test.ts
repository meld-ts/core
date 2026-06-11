import { describe, expect, test } from 'bun:test';
import { cloneObj } from './cloneObj';

describe('cloneObj', () => {
  test('returns a new object, not the same reference', () => {
    const src = { a: 1 };
    const cloned = cloneObj(src);
    expect(cloned).toEqual(src);
    expect(cloned).not.toBe(src);
  });

  test('deep clones nested objects', () => {
    const src = { a: { b: { c: 42 } } };
    const cloned = cloneObj(src);
    expect(cloned).toEqual(src);
    cloned.a.b.c = 99;
    expect(src.a.b.c).toBe(42);
  });

  test('deep clones arrays inside objects', () => {
    const src = { items: [1, 2, 3] };
    const cloned = cloneObj(src);
    cloned.items.push(4);
    expect(src.items).toHaveLength(3);
  });

  test('handles empty object', () => {
    expect(cloneObj({})).toEqual({});
  });

  test('clones object with multiple value types', () => {
    const src = { str: 'hello', num: 42, bool: true, nil: null };
    expect(cloneObj(src)).toEqual(src);
  });
});
