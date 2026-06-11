import { describe, expect, test } from 'bun:test';
import { errorMessage, isErrorLike } from './error';

describe('guards/error', () => {
  describe('isErrorLike', () => {
    test('should return true for objects with non-empty message or error', () => {
      expect(isErrorLike({ message: 'test' })).toBe(true);
      expect(isErrorLike({ error: 'test' })).toBe(true);
      expect(isErrorLike({ message: 'a', error: 'b' })).toBe(true);
    });

    test('should return false when both fields are empty or missing', () => {
      expect(isErrorLike({})).toBe(false);
      expect(isErrorLike({ message: '' })).toBe(false);
      expect(isErrorLike({ error: '' })).toBe(false);
      expect(isErrorLike({ message: '', error: '' })).toBe(false);
    });

    test('should return false for non-object values', () => {
      expect(isErrorLike('test')).toBe(false);
      expect(isErrorLike(null)).toBe(false);
      expect(isErrorLike(42)).toBe(false);
    });
  });

  describe('errorMessage', () => {
    test('should extract message from various sources', () => {
      expect(errorMessage({ message: 'test' })).toBe('test');
      expect(errorMessage({ error: 'test' })).toBe('test');
      expect(errorMessage('test')).toBe('test');
      expect(errorMessage(new Error('test'))).toBe('test');
    });

    test('message takes priority over error field', () => {
      expect(errorMessage({ message: 'msg', error: 'err' })).toBe('msg');
    });

    test('falls back to error field when message is empty', () => {
      expect(errorMessage({ message: '', error: 'fallback' })).toBe('fallback');
    });

    test('should return empty string for nil and empty Error', () => {
      expect(errorMessage(null)).toBe('');
      expect(errorMessage(undefined)).toBe('');
      expect(errorMessage(new Error(''))).toBe('');
    });

    test('should return empty string for unrecognized values', () => {
      expect(errorMessage(42)).toBe('');
      expect(errorMessage({})).toBe('');
    });
  });
});
