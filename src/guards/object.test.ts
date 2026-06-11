import { describe, expect, test } from 'bun:test';
import { isCtor, isInferObj, isPlainObj, isPromise } from './object';

describe('guards/object', () => {
  describe('isInferObj', () => {
    test('isInferObj check types', () => {
      expect(isInferObj({})).toBe(true);
      expect(isInferObj(new Object())).toBe(true);
      expect(isInferObj({ foo: true })).toBe(true);
      expect(isInferObj([])).toBe(false);
      expect(isInferObj(null)).toBe(false);
      expect(isInferObj(undefined)).toBe(false);
      expect(isInferObj('')).toBe(false);
    });

    test('isInferObj with callback', () => {
      const isTestType = (it: { key: unknown }): it is { key: string } =>
        typeof it.key === 'string';
      expect(isInferObj({ key: 'aa' }, isTestType)).toBe(true);
      expect(isInferObj({ key: 123 }, isTestType)).toBe(false);
    });
  });

  describe('isPlainObj', () => {
    test('should return true for plain objects', () => {
      expect(isPlainObj({})).toBe(true);
      expect(isPlainObj({ a: 1 })).toBe(true);
    });

    test('should return true for null-prototype objects', () => {
      expect(isPlainObj(Object.create(null))).toBe(true);
    });

    test('should return false for arrays and special objects', () => {
      expect(isPlainObj([])).toBe(false);
      expect(isPlainObj(new Date())).toBe(false);
      expect(isPlainObj(null)).toBe(false);
    });

    test('should return false for Map, Set, Error and other built-ins', () => {
      expect(isPlainObj(new Map())).toBe(false);
      expect(isPlainObj(new Set())).toBe(false);
      expect(isPlainObj(new Error())).toBe(false);
      expect(isPlainObj(/regex/)).toBe(false);
    });
  });

  describe('isCtor', () => {
    test('should return true for class and regular function', () => {
      class Foo {}
      function Bar() {}
      expect(isCtor(Foo)).toBe(true);
      expect(isCtor(Bar)).toBe(true);
    });

    test('should return false for arrow function (no prototype)', () => {
      const arrow = () => {};
      expect(isCtor(arrow)).toBe(false);
    });

    test('should return false for non-function values', () => {
      expect(isCtor(null)).toBe(false);
      expect(isCtor(undefined)).toBe(false);
      expect(isCtor({})).toBe(false);
      expect(isCtor(42)).toBe(false);
    });

    test('should narrow type to Constructor<T>', () => {
      class MyClass {
        value = 1;
      }
      if (isCtor<MyClass>(MyClass)) {
        const instance = new MyClass();
        expect(instance.value).toBe(1);
      }
    });
  });

  describe('isPromise', () => {
    test('should return true for Promise', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    test('should return true for thenable', () => {
      const thenable: { then: () => void; catch: () => void } = {
        then: () => {},
        catch: () => {},
      };
      expect(isPromise(thenable)).toBe(true);
    });

    test('should return false for non-promise', () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise('hello')).toBe(false);
      expect(isPromise(null)).toBe(false);
    });
  });
});
