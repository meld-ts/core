import { describe, expect, test } from 'bun:test';
import { arrayGuard, isArray, notEmptyArray } from './array';
import { and } from './logicality';
import { isString } from './string';

describe('guards/array', () => {
  describe('isArray', () => {
    test('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    test('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('hello')).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe('notEmptyArray', () => {
    test('should return true for non-empty arrays', () => {
      expect(notEmptyArray([1])).toBe(true);
      expect(notEmptyArray([1, 2, 3])).toBe(true);
    });

    test('should return false for empty arrays and non-arrays', () => {
      expect(notEmptyArray([])).toBe(false);
      expect(notEmptyArray(null)).toBe(false);
      expect(notEmptyArray({})).toBe(false);
    });

    test('should support type guard', () => {
      expect(notEmptyArray(['a', 'b'], isString)).toBe(true);
      expect(notEmptyArray(['a', 1], isString)).toBe(false);
      expect(notEmptyArray([], isString)).toBe(false);
    });
  });

  describe('arrayGuard', () => {
    test('should create a curried array type guard', () => {
      const isStringArray = arrayGuard(isString);
      expect(isStringArray(['a', 'b'])).toBe(true);
      expect(isStringArray(['a', 1])).toBe(false);
      expect(isStringArray([])).toBe(true);
      expect(isStringArray('hello')).toBe(false);
    });

    test('should work with and combinator', () => {
      const isStringArray = arrayGuard(isString);
      const isNonEmptyStringArray = and(isStringArray, (arr) => arr.length > 0);
      expect(isNonEmptyStringArray(['a'])).toBe(true);
      expect(isNonEmptyStringArray([])).toBe(false);
      expect(isNonEmptyStringArray([1])).toBe(false);
    });
  });
});
