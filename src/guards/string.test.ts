import { describe, expect, test } from 'bun:test';
import { isString, notEmptyString } from './string';

describe('guards/string', () => {
  describe('isString', () => {
    test('should return true for string types', () => {
      expect(isString('')).toBe(true);
      expect(isString(String.fromCharCode(10000))).toBe(true);
      // 不再接受 String 包装对象 — 类型谎言已修复
      expect(isString(new String(''))).toBe(false);
      expect(isString(new String('hello'))).toBe(false);
    });

    test('should return false for non-string types', () => {
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({ a: 1 })).toBe(false);
      expect(isString([1, 2, 3])).toBe(false);
      expect(isString(123)).toBe(false);
      expect(isString(0)).toBe(false);
      expect(isString(false)).toBe(false);
      expect(isString(/Hello/)).toBe(false);
      expect(isString(Symbol('TTT'))).toBe(false);
    });
  });

  describe('notEmptyString', () => {
    test('should return true for non-empty strings', () => {
      expect(notEmptyString('hello')).toBe(true);
      expect(notEmptyString('  hello  ')).toBe(true);
    });

    test('should return false for blank or empty strings', () => {
      expect(notEmptyString(' ')).toBe(false);
      expect(notEmptyString('\n')).toBe(false);
      expect(notEmptyString(' \n\t')).toBe(false);
      expect(notEmptyString('')).toBe(false);
    });

    test('should return false for non-string', () => {
      expect(notEmptyString(null)).toBe(false);
      expect(notEmptyString(false)).toBe(false);
      expect(notEmptyString(undefined)).toBe(false);
      expect(notEmptyString([])).toBe(false);
    });
  });
});
