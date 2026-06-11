import { describe, expect, test } from 'bun:test';
import { isInferObject, isPlainObject } from './object';

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
});
