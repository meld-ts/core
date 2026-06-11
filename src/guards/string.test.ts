import { describe, expect, test } from 'bun:test';
import { isStr, notEmptyStr } from './string';

describe('guards/string', () => {
  describe('isStr', () => {
    test('should return true for string types', () => {
      expect(isStr('')).toBe(true);
      expect(isStr(String.fromCharCode(10000))).toBe(true);
      expect(isStr(new String(''))).toBe(true);
      expect(isStr(new String(String.fromCharCode(10000)))).toBe(true);
      expect(isStr(Object.assign('hi', { constructor: Array }))).toBe(true);
      expect(isStr(Object.assign('hi', { toString: 123 }))).toBe(true);
      expect(isStr(Object.assign('hi', { valueOf: 123 }))).toBe(true);
      expect(isStr(Object.assign('hi', { constructor: RegExp }))).toBe(true);
      expect(isStr(new Proxy(new String('hello'), {}))).toBe(true);
    });

    test('should return false for non-string types', () => {
      expect(isStr(null)).toBe(false);
      expect(isStr(undefined)).toBe(false);
      expect(isStr({ a: 1 })).toBe(false);
      expect(isStr([1, 2, 3])).toBe(false);
      expect(isStr(123)).toBe(false);
      expect(isStr(0)).toBe(false);
      expect(isStr(false)).toBe(false);
      expect(isStr(/Hello/)).toBe(false);
      expect(isStr(Symbol('TTT'))).toBe(false);
    });
  });

  describe('notEmptyStr', () => {
    test('should return true for non-empty strings', () => {
      expect(notEmptyStr(' ')).toBe(true);
      expect(notEmptyStr('\n')).toBe(true);
      expect(notEmptyStr(' \n\t')).toBe(true);
    });

    test('should return false for empty or non-string', () => {
      expect(notEmptyStr('')).toBe(false);
      expect(notEmptyStr(null)).toBe(false);
      expect(notEmptyStr(false)).toBe(false);
      expect(notEmptyStr(undefined)).toBe(false);
      expect(notEmptyStr([])).toBe(false);
    });
  });
});
