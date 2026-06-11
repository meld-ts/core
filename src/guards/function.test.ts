import { describe, expect, test } from 'bun:test';
import { isConstructor, isFunction, isPromise } from './function';

describe('guards/function', () => {
  describe('isConstructor', () => {
    test('should return true for class and regular function', () => {
      class Foo {}
      function Bar() {}
      expect(isConstructor(Foo)).toBe(true);
      expect(isConstructor(Bar)).toBe(true);
    });

    test('should return false for arrow function (no prototype)', () => {
      const arrow = () => {};
      expect(isConstructor(arrow)).toBe(false);
    });

    test('should return false for non-function values', () => {
      expect(isConstructor(null)).toBe(false);
      expect(isConstructor(undefined)).toBe(false);
      expect(isConstructor({})).toBe(false);
      expect(isConstructor(42)).toBe(false);
    });

    test('should narrow type to Constructor<T>', () => {
      class MyClass {
        value = 1;
      }
      if (isConstructor<MyClass>(MyClass)) {
        const instance = new MyClass();
        expect(instance.value).toBe(1);
      }
    });
  });

  describe('isFunction', () => {
    test('should return true for functions of all kinds', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function () {})).toBe(true);
      expect(isFunction(class {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
    });

    test('should return false for non-functions', () => {
      expect(isFunction(null)).toBe(false);
      expect(isFunction({})).toBe(false);
      expect(isFunction('hello')).toBe(false);
      expect(isFunction(42)).toBe(false);
    });

    test('should narrow type with generic — ReturnType extraction', () => {
      const fn: unknown = (a: number, b: string): boolean => a > 0 && b.length > 0;
      if (isFunction<(a: number, b: string) => boolean>(fn)) {
        const result: boolean = fn(1, 'hello');
        expect(result).toBe(true);
      }
    });

    test('should narrow type with generic — Parameters extraction', () => {
      type MyFn = (x: string, y: number) => string;
      const val: unknown = (x: string, y: number): string => `${x}:${y}`;
      if (isFunction<MyFn>(val)) {
        const result: ReturnType<MyFn> = val('a', 42);
        expect(result).toBe('a:42');
      }
    });

    test('should default to AnyFunction when no generic specified', () => {
      const val: unknown = () => 'hello';
      if (isFunction(val)) {
        const result = val();
        expect(result).toBe('hello');
      }
    });
  });

  describe('isPromise', () => {
    test('should return true for Promise', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    test('should return true for thenable with catch', () => {
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
