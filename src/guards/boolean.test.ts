import { describe, expect, test } from 'bun:test';
import { isBoolean, toBoolean } from './boolean';

describe('guards/boolean', () => {
  describe('isBoolean', () => {
    test('should return true for boolean', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    test('should return false for non-boolean', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
    });
  });

  describe('toBoolean', () => {
    test('null / undefined → false', () => {
      expect(toBoolean(null)).toBe(false);
      expect(toBoolean(undefined)).toBe(false);
    });

    test('boolean → original value', () => {
      expect(toBoolean(true)).toBe(true);
      expect(toBoolean(false)).toBe(false);
    });

    test('number → > 0 is true', () => {
      expect(toBoolean(1)).toBe(true);
      expect(toBoolean(0.1)).toBe(true);
      expect(toBoolean(0)).toBe(false);
      expect(toBoolean(-1)).toBe(false);
      expect(toBoolean(Number.NaN)).toBe(false);
    });

    test('"true" / "yes" (case-insensitive) → true', () => {
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean('TRUE')).toBe(true);
      expect(toBoolean('True')).toBe(true);
      expect(toBoolean('yes')).toBe(true);
      expect(toBoolean('YES')).toBe(true);
      expect(toBoolean('Yes')).toBe(true);
    });

    test('"false" / "no" (case-insensitive) → false', () => {
      expect(toBoolean('false')).toBe(false);
      expect(toBoolean('FALSE')).toBe(false);
      expect(toBoolean('no')).toBe(false);
      expect(toBoolean('NO')).toBe(false);
    });

    test('other strings → Boolean(val): non-empty true, empty false', () => {
      expect(toBoolean('1')).toBe(true);
      expect(toBoolean('hello')).toBe(true);
      expect(toBoolean(' ')).toBe(true);
      expect(toBoolean('')).toBe(false);
    });

    test('object / array → delegated to Boolean()', () => {
      expect(toBoolean({})).toBe(true);
      expect(toBoolean([])).toBe(true);
      expect(toBoolean(() => {})).toBe(true);
    });
  });
});
