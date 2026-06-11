import { describe, expect, test } from 'bun:test';
import { aryGuard, isAry, notEmptyAry } from './array';
import { and } from './logicality';
import { isStr } from './string';

describe('guards/array', () => {
  describe('isAry', () => {
    test('should return true for arrays', () => {
      expect(isAry([])).toBe(true);
      expect(isAry([1, 2, 3])).toBe(true);
    });

    test('should return false for non-arrays', () => {
      expect(isAry({})).toBe(false);
      expect(isAry('hello')).toBe(false);
      expect(isAry(null)).toBe(false);
    });
  });

  describe('notEmptyAry', () => {
    test('should return true for non-empty arrays', () => {
      expect(notEmptyAry([1])).toBe(true);
      expect(notEmptyAry([1, 2, 3])).toBe(true);
    });

    test('should return false for empty arrays and non-arrays', () => {
      expect(notEmptyAry([])).toBe(false);
      expect(notEmptyAry(null)).toBe(false);
      expect(notEmptyAry({})).toBe(false);
    });

    test('should support type guard', () => {
      expect(notEmptyAry(['a', 'b'], isStr)).toBe(true);
      expect(notEmptyAry(['a', 1], isStr)).toBe(false);
      expect(notEmptyAry([], isStr)).toBe(false);
    });
  });

  describe('aryGuard', () => {
    test('should create a curried array type guard', () => {
      const isStrAry = aryGuard(isStr);
      expect(isStrAry(['a', 'b'])).toBe(true);
      expect(isStrAry(['a', 1])).toBe(false);
      expect(isStrAry([])).toBe(true);
      expect(isStrAry('hello')).toBe(false);
    });

    test('should work with and combinator', () => {
      const isStrAry = aryGuard(isStr);
      const isNonEmptyStrAry = and(isStrAry, (arr) => arr.length > 0);
      expect(isNonEmptyStrAry(['a'])).toBe(true);
      expect(isNonEmptyStrAry([])).toBe(false);
      expect(isNonEmptyStrAry([1])).toBe(false);
    });
  });
});
