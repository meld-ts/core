import { describe, expect, test } from 'bun:test';
import { isBool, toBool } from './boolean';

describe('guards/bool', () => {
  describe('isBool', () => {
    test('should return true for boolean', () => {
      expect(isBool(true)).toBe(true);
      expect(isBool(false)).toBe(true);
    });

    test('should return false for non-boolean', () => {
      expect(isBool(0)).toBe(false);
      expect(isBool('true')).toBe(false);
      expect(isBool(null)).toBe(false);
      expect(isBool(undefined)).toBe(false);
    });
  });

  describe('toBool', () => {
    test('null / undefined → false', () => {
      expect(toBool(null)).toBe(false);
      expect(toBool(undefined)).toBe(false);
    });

    test('boolean → original value', () => {
      expect(toBool(true)).toBe(true);
      expect(toBool(false)).toBe(false);
    });

    test('number → > 0 is true', () => {
      expect(toBool(1)).toBe(true);
      expect(toBool(0.1)).toBe(true);
      expect(toBool(0)).toBe(false);
      expect(toBool(-1)).toBe(false);
      expect(toBool(Number.NaN)).toBe(false);
    });

    test('"true" / "yes" (case-insensitive) → true', () => {
      expect(toBool('true')).toBe(true);
      expect(toBool('TRUE')).toBe(true);
      expect(toBool('True')).toBe(true);
      expect(toBool('yes')).toBe(true);
      expect(toBool('YES')).toBe(true);
      expect(toBool('Yes')).toBe(true);
    });

    test('"false" / "no" (case-insensitive) → false', () => {
      expect(toBool('false')).toBe(false);
      expect(toBool('FALSE')).toBe(false);
      expect(toBool('no')).toBe(false);
      expect(toBool('NO')).toBe(false);
    });

    test('other strings → Boolean(val): non-empty true, empty false', () => {
      expect(toBool('1')).toBe(true);
      expect(toBool('hello')).toBe(true);
      expect(toBool(' ')).toBe(true);
      expect(toBool('')).toBe(false);
    });

    test('object / array → delegated to Boolean()', () => {
      expect(toBool({})).toBe(true);
      expect(toBool([])).toBe(true);
      expect(toBool(() => {})).toBe(true);
    });
  });
});
