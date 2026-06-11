import { describe, expect, test } from 'bun:test';

import { isDate, isInferObject, isPlainObject, isRegExp } from './object';

describe('guards/object', () => {
  describe('isInferObject', () => {
    test('isInferObject check types', () => {
      expect(isInferObject({})).toBe(true);
      expect(isInferObject(new Object())).toBe(true);
      expect(isInferObject({ foo: true })).toBe(true);
      expect(isInferObject([])).toBe(false);
      expect(isInferObject(null)).toBe(false);
      expect(isInferObject(undefined)).toBe(false);
      expect(isInferObject('')).toBe(false);
    });

    test('isInferObject with callback', () => {
      const isTestType = (it: { key: unknown }): it is { key: string } =>
        typeof it.key === 'string';
      expect(isInferObject({ key: 'aa' }, isTestType)).toBe(true);
      expect(isInferObject({ key: 123 }, isTestType)).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    test('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    test('should return true for null-prototype objects', () => {
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    test('should return false for arrays and special objects', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(null)).toBe(false);
    });

    test('should return false for Map, Set, Error and other built-ins', () => {
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Set())).toBe(false);
      expect(isPlainObject(new Error())).toBe(false);
      expect(isPlainObject(/regex/)).toBe(false);
    });
  });

  describe('isDate', () => {
    test('should return true for Date instances', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('2024-01-01'))).toBe(true);
    });

    test('should return true for Invalid Date (still a Date instance)', () => {
      expect(isDate(new Date('invalid'))).toBe(true);
    });

    test('should return false for non-Date values', () => {
      expect(isDate(Date.now())).toBe(false);
      expect(isDate('2024-01-01')).toBe(false);
      expect(isDate(null)).toBe(false);
      expect(isDate({})).toBe(false);
    });
  });

  describe('isRegExp', () => {
    test('should return true for RegExp instances', () => {
      expect(isRegExp(/hello/)).toBe(true);
      // biome-ignore lint/complexity/useRegexLiterals: 这里用于测试
      expect(isRegExp(new RegExp('hi'))).toBe(true);
      expect(isRegExp(/test/gi)).toBe(true);
    });

    test('should return false for non-RegExp values', () => {
      expect(isRegExp('/hello/')).toBe(false);
      expect(isRegExp('hello')).toBe(false);
      expect(isRegExp(null)).toBe(false);
      expect(isRegExp({})).toBe(false);
    });
  });
});
