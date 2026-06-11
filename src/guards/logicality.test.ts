import { describe, expect, test } from 'bun:test';
import { isNull } from './existence';
import { and, not, or } from './logicality';
import { isNumber } from './number';
import { isStr } from './string';

describe('guards/logicality', () => {
  describe('and', () => {
    test('should combine guards with AND logic', () => {
      const isPositiveNumber = (val: unknown): val is number =>
        typeof val === 'number' && val > 0;
      const isEven = (val: number): val is number => val % 2 === 0;
      const isPositiveEven = and(isPositiveNumber, isEven);

      expect(isPositiveEven(4)).toBe(true);
      expect(isPositiveEven(3)).toBe(false);
      expect(isPositiveEven(-2)).toBe(false);
    });

    test('should return false if any guard fails', () => {
      const guard = and(isStr, (val): val is string => val.length > 3);
      expect(guard('hello')).toBe(true);
      expect(guard('hi')).toBe(false);
      expect(guard(123)).toBe(false);
    });
  });

  describe('or', () => {
    test('should combine guards with OR logic', () => {
      const isStrOrNum = or(isStr, isNumber);
      expect(isStrOrNum('hello')).toBe(true);
      expect(isStrOrNum(123)).toBe(true);
      expect(isStrOrNum(true)).toBe(false);
    });

    test('should infer union type from guards', () => {
      const isStrOrNum = or(isStr, isNumber);
      const value: unknown = 'hello';
      if (isStrOrNum(value)) {
        // value is string | number at this point
        expect(typeof value === 'string' || typeof value === 'number').toBe(
          true,
        );
      }
    });
  });

  describe('not', () => {
    test('should negate guard at runtime', () => {
      const isNotNull = not(isNull);
      const isNotStr = not(isStr);

      expect(isNotNull('hello')).toBe(true);
      expect(isNotNull(null)).toBe(false);
      expect(isNotStr(123)).toBe(true);
      expect(isNotStr('hello')).toBe(false);
    });

    test('should return boolean function, not TypeGuard', () => {
      const isNotNull = not(isNull);
      expect(typeof isNotNull).toBe('function');
      // not() returns (val: unknown) => boolean, not a type guard
      expect(isNotNull(42)).toBe(true);
    });
  });
});
