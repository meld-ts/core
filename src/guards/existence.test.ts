import { describe, expect, test } from 'bun:test';
import { isNil, isNull, isPresent, isUndef } from './existence';

describe('guards/existence', () => {
  describe('isNull', () => {
    test('should return true for null', () => {
      expect(isNull(null)).toBe(true);
    });

    test('should return false for non-null', () => {
      expect(isNull(undefined)).toBe(false);
      expect(isNull(0)).toBe(false);
    });
  });

  describe('isUndef', () => {
    test('should return true for undefined', () => {
      expect(isUndef(undefined)).toBe(true);
    });

    test('should return false for non-undefined', () => {
      expect(isUndef(null)).toBe(false);
    });
  });

  describe('isNil', () => {
    test('should return true for null or undefined', () => {
      expect(isNil(null)).toBe(true);
      expect(isNil(undefined)).toBe(true);
    });

    test('should return false for non-nil', () => {
      expect(isNil(0)).toBe(false);
      expect(isNil('')).toBe(false);
    });
  });

  describe('isPresent', () => {
    test('should narrow type for non-null values', () => {
      const value: string | null | undefined = 'hello';
      if (isPresent(value)) {
        expect(typeof value).toBe('string');
      }
    });

    test('should return false for null or undefined', () => {
      expect(isPresent(null)).toBe(false);
      expect(isPresent(undefined)).toBe(false);
    });
  });
});
