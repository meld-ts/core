import { describe, expect, test } from 'bun:test';
import { isSymbol } from './symbol';

describe('guards/symbol', () => {
  describe('isSymbol', () => {
    test('should return true for symbol types', () => {
      expect(isSymbol(Symbol())).toBe(true);
      expect(isSymbol(Symbol('test'))).toBe(true);
      expect(isSymbol(Symbol.iterator)).toBe(true);
      expect(isSymbol(Symbol.for('key'))).toBe(true);
    });

    test('should return true for unique symbols each time', () => {
      // 每个 Symbol() 都是唯一的，但 isSymbol 检查的是类型
      expect(isSymbol(Symbol('a'))).toBe(true);
      expect(isSymbol(Symbol('a'))).toBe(true);
    });

    test('should return false for non-symbol types', () => {
      expect(isSymbol(null)).toBe(false);
      expect(isSymbol(undefined)).toBe(false);
      expect(isSymbol('symbol')).toBe(false);
      expect(isSymbol(42)).toBe(false);
      expect(isSymbol({})).toBe(false);
      expect(isSymbol([])).toBe(false);
      expect(isSymbol(() => {})).toBe(false);
    });
  });
});
