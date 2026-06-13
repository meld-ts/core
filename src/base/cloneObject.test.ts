import { describe, expect, test } from 'bun:test';

import {
  cloneObject,
  cloneObjectByAssign,
  cloneObjectByJson,
} from './cloneObject';

describe('cloneObject', () => {
  test('returns a new object, not the same reference', () => {
    const src = { a: 1 };
    const cloned = cloneObject(src);
    expect(cloned).toEqual(src);
    expect(cloned).not.toBe(src);
  });

  test('deep clones nested objects', () => {
    const src = { a: { b: { c: 42 } } };
    const cloned = cloneObject(src);
    expect(cloned).toEqual(src);
    cloned.a.b.c = 99;
    expect(src.a.b.c).toBe(42);
  });

  test('deep clones arrays inside objects', () => {
    const src = { items: [1, 2, 3] };
    const cloned = cloneObject(src);
    cloned.items.push(4);
    expect(src.items).toHaveLength(3);
  });

  test('handles empty object', () => {
    expect(cloneObject({})).toEqual({});
  });

  test('clones object with multiple value types', () => {
    const src = { str: 'hello', num: 42, bool: true, nil: null };
    expect(cloneObject(src)).toEqual(src);
  });

  test('throws TypeError when called with null', () => {
    expect(() => cloneObject(null as unknown as object)).toThrow(TypeError);
  });

  test('throws TypeError when called with string', () => {
    expect(() => cloneObject('hello' as unknown as object)).toThrow(TypeError);
  });

  test('throws TypeError when called with number', () => {
    expect(() => cloneObject(42 as unknown as object)).toThrow(TypeError);
  });

  test('falls back to cloneObjectByJson when structuredClone is unavailable', () => {
    const original = globalThis.structuredClone;
    // @ts-expect-error
    globalThis.structuredClone = undefined;
    try {
      const src = { a: { b: 1 } };
      const cloned = cloneObject(src);
      expect(cloned).toEqual(src);
      expect(cloned).not.toBe(src);
    } finally {
      globalThis.structuredClone = original;
    }
  });
});

describe('cloneObjectByJson', () => {
  test('returns a new object, not the same reference', () => {
    const src = { a: 1 };
    const cloned = cloneObjectByJson(src);
    expect(cloned).toEqual(src);
    expect(cloned).not.toBe(src);
  });

  test('deep clones nested objects', () => {
    const src = { a: { b: { c: 42 } } };
    const cloned = cloneObjectByJson(src);
    expect(cloned).toEqual(src);
    cloned.a.b.c = 99;
    expect(src.a.b.c).toBe(42);
  });

  test('deep clones arrays', () => {
    const src = { items: [1, 2, 3] };
    const cloned = cloneObjectByJson(src);
    cloned.items.push(4);
    expect(src.items).toHaveLength(3);
  });

  test('handles empty object', () => {
    expect(cloneObjectByJson({})).toEqual({});
  });

  test('handles null and nested values', () => {
    const src = { str: 'hello', num: 42, bool: true, nil: null };
    expect(cloneObjectByJson(src)).toEqual(src);
  });

  test('falls back to shallow copy on circular reference', () => {
    const src: Record<string, unknown> = { a: 1 };
    src.self = src;
    const cloned = cloneObjectByJson(src);
    // 循环引用导致 JSON.stringify 抛异常，降级为 assign（浅拷贝）
    // 浅拷贝不会深度复制 self，所以 self 仍指回原对象
    expect(cloned).not.toBe(src);
    expect(cloned.a).toBe(1);
  });

  test('throws TypeError when called with null', () => {
    expect(() => cloneObjectByJson(null as unknown as object)).toThrow(
      TypeError,
    );
  });

  test('throws TypeError when called with string', () => {
    expect(() => cloneObjectByJson('hello' as unknown as object)).toThrow(
      TypeError,
    );
  });

  test('throws TypeError when called with number', () => {
    expect(() => cloneObjectByJson(42 as unknown as object)).toThrow(TypeError);
  });

  test('falls back to array spread on circular array', () => {
    const arr = [1, 2, 3] as unknown[];
    arr.push(arr);
    const cloned = cloneObjectByJson(arr as unknown as object);
    expect(Array.isArray(cloned)).toBe(true);
    expect(cloned).not.toBe(arr);
    expect((cloned as unknown[])[0]).toBe(1);
    expect((cloned as unknown[])[2]).toBe(3);
  });
});

describe('cloneObjectByAssign', () => {
  test('returns a new object, not the same reference', () => {
    const src = { a: 1 };
    const cloned = cloneObjectByAssign(src);
    expect(cloned).toEqual(src);
    expect(cloned).not.toBe(src);
  });

  test('shallow copy — nested objects share references', () => {
    const src = { a: { b: 1 } };
    const cloned = cloneObjectByAssign(src);
    expect(cloned.a).toBe(src.a); // 同一个引用
    cloned.a.b = 99;
    expect(src.a.b).toBe(99); // 原对象也被修改了
  });

  test('handles empty object', () => {
    expect(cloneObjectByAssign({})).toEqual({});
  });

  test('copies top-level properties only', () => {
    const src = { str: 'hello', num: 42, arr: [1, 2, 3] };
    const cloned = cloneObjectByAssign(src);
    expect(cloned).toEqual(src);
    expect(cloned.arr).toBe(src.arr); // 数组是浅拷贝，共享引用
    cloned.arr.push(4);
    expect(src.arr).toHaveLength(4);
  });

  test('throws TypeError when called with null', () => {
    expect(() => cloneObjectByAssign(null as unknown as object)).toThrow(
      TypeError,
    );
  });

  test('throws TypeError when called with undefined', () => {
    expect(() => cloneObjectByAssign(undefined as unknown as object)).toThrow(
      TypeError,
    );
  });

  test('throws TypeError when called with boolean', () => {
    expect(() => cloneObjectByAssign(true as unknown as object)).toThrow(
      TypeError,
    );
  });
});
