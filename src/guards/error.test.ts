import { describe, expect, test } from 'bun:test';
import { errMsg, isErrLike } from './error';

describe('guards/error', () => {
  describe('isErrLike', () => {
    test('should return true for objects with non-empty message or error', () => {
      expect(isErrLike({ message: 'test' })).toBe(true);
      expect(isErrLike({ error: 'test' })).toBe(true);
      expect(isErrLike({ message: 'a', error: 'b' })).toBe(true);
    });

    test('should return false when both fields are empty or missing', () => {
      expect(isErrLike({})).toBe(false);
      expect(isErrLike({ message: '' })).toBe(false);
      expect(isErrLike({ error: '' })).toBe(false);
      expect(isErrLike({ message: '', error: '' })).toBe(false);
    });

    test('should return false for non-object values', () => {
      expect(isErrLike('test')).toBe(false);
      expect(isErrLike(null)).toBe(false);
      expect(isErrLike(42)).toBe(false);
    });
  });

  describe('errMsg', () => {
    test('should extract message from various sources', () => {
      expect(errMsg({ message: 'test' })).toBe('test');
      expect(errMsg({ error: 'test' })).toBe('test');
      expect(errMsg('test')).toBe('test');
      expect(errMsg(new Error('test'))).toBe('test');
    });

    test('message takes priority over error field', () => {
      expect(errMsg({ message: 'msg', error: 'err' })).toBe('msg');
    });

    test('falls back to error field when message is empty', () => {
      expect(errMsg({ message: '', error: 'fallback' })).toBe('fallback');
    });

    test('should return empty string for nil and empty Error', () => {
      expect(errMsg(null)).toBe('');
      expect(errMsg(undefined)).toBe('');
      expect(errMsg(new Error(''))).toBe('');
    });

    test('should return empty string for unrecognized values', () => {
      expect(errMsg(42)).toBe('');
      expect(errMsg({})).toBe('');
    });
  });
});
