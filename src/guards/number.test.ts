import { describe, expect, test } from 'bun:test';
import {
  calcProgress,
  ceil10,
  decimalAdjust,
  floor10,
  isInt,
  isNumber,
  isNumberVal,
  limitNumberMax,
  limitNumberMin,
  limitNumberMinMax,
  round10,
  toNumber,
} from './number';

describe('guards/number', () => {
  test('isNumber', () => {
    expect(isNumber(123)).toBe(true);
    expect(isNumber(-1)).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isNumber(-0)).toBe(true);
    expect(isNumber(0.5)).toBe(true);
    expect(isNumber('123')).toBe(false);
    expect(isNumber(null)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
    expect(isNumber({})).toBe(false);
    expect(isNumber([])).toBe(false);
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  test('isInt', () => {
    expect(isInt(3)).toBe(true);
    expect(isInt(3.14)).toBe(false);
    expect(isInt('3')).toBe(false);
    expect(isInt(Number.NaN)).toBe(false);
  });

  test('isNumberVal', () => {
    expect(isNumberVal(123)).toBe(true);
    expect(isNumberVal('123')).toBe(true);
    expect(isNumberVal('3.14')).toBe(true);
    expect(isNumberVal('-1')).toBe(true);
    expect(isNumberVal('  123  ')).toBe(true);
    // parseFloat 语义：前缀能解析出数字即通过
    expect(isNumberVal('123abc')).toBe(true);
    expect(isNumberVal('abc')).toBe(false);
    expect(isNumberVal('')).toBe(false);
    expect(isNumberVal(' ')).toBe(false);
    expect(isNumberVal(null)).toBe(false);
    expect(isNumberVal(undefined)).toBe(false);
  });

  test('toNumber', () => {
    expect(toNumber(123)).toBe(123);
    expect(toNumber('123')).toBe(123);
    expect(toNumber('3.14')).toBe(3.14);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber(true)).toBe(1);
    expect(toNumber(false)).toBe(0);
    expect(toNumber(null, -1)).toBe(-1);
    expect(toNumber('abc', 99)).toBe(99);
  });

  test('limitNumberMin', () => {
    expect(limitNumberMin(123, 100)).toBe(123);
    expect(limitNumberMin('123', 100)).toBe(123);
    expect(limitNumberMin('abc', 100)).toBe(100);
    expect(limitNumberMin(99, 100)).toBe(100);
  });

  test('limitNumberMax', () => {
    expect(limitNumberMax(123, 200)).toBe(123);
    expect(limitNumberMax('123', 200)).toBe(123);
    expect(limitNumberMax(201, 200)).toBe(200);
  });

  test('limitNumberMinMax', () => {
    expect(limitNumberMinMax(123, 100, 200)).toBe(123);
    expect(limitNumberMinMax(99, 100, 200)).toBe(100);
    expect(limitNumberMinMax(201, 100, 200)).toBe(200);
  });

  describe('decimalAdjust', () => {
    test('round', () => {
      expect(decimalAdjust('round', 123.456, -2)).toBe(123.46);
      expect(decimalAdjust('round', 55.55, -1)).toBe(55.6);
      expect(round10(55.55, -1)).toBe(55.6);
    });

    test('ceil', () => {
      expect(decimalAdjust('ceil', 123.456, -2)).toBe(123.46);
      expect(decimalAdjust('ceil', 55.51, -1)).toBe(55.6);
      expect(ceil10(55.51, -1)).toBe(55.6);
    });

    test('floor', () => {
      expect(decimalAdjust('floor', 123.456, -2)).toBe(123.45);
      expect(decimalAdjust('floor', 55.59, -1)).toBe(55.5);
      expect(floor10(55.59, -1)).toBe(55.5);
    });

    test('no exp or exp=0 falls back to plain Math method', () => {
      expect(decimalAdjust('round', 1.5)).toBe(2);
      expect(decimalAdjust('floor', 1.9)).toBe(1);
      expect(decimalAdjust('ceil', 1.1)).toBe(2);
      expect(decimalAdjust('round', 1.5, 0)).toBe(2);
    });

    test('null exp falls back to plain Math method', () => {
      expect(decimalAdjust('round', 1.5, null)).toBe(2);
    });

    test('NaN value returns NaN', () => {
      expect(decimalAdjust('round', Number.NaN, -1)).toBeNaN();
    });

    test('non-integer exp returns NaN', () => {
      expect(decimalAdjust('round', 1.5, 1.5)).toBeNaN();
    });
  });

  describe('calcProgress', () => {
    test('should return correct progress', () => {
      expect(calcProgress(50, 100)).toBe(0.5);
      expect(calcProgress(75, 100)).toBe(0.75);
      expect(calcProgress(0, 100)).toBe(0);
      expect(calcProgress(100, 100)).toBe(1);
    });

    test('should cap result between 0 and 1', () => {
      expect(calcProgress(150, 100)).toBe(1);
      expect(calcProgress(-10, 100)).toBe(0);
    });

    test('should throw for zero or non-finite denominator', () => {
      expect(() => calcProgress(50, 0)).toThrow(
        'The denominator cannot be 0 or NaN',
      );
      expect(() => calcProgress(50, Number.NaN)).toThrow(
        'The denominator cannot be 0 or NaN',
      );
      expect(() => calcProgress(50, Number.POSITIVE_INFINITY)).toThrow(
        'The denominator cannot be 0 or NaN',
      );
    });
  });
});
