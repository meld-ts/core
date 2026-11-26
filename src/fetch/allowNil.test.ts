import { describe, expect, test } from 'bun:test';
import { allowNil } from './allowNil';

describe('allowNil', () => {
  test('is a global symbol and a single value', () => {
    expect(typeof allowNil).toBe('symbol');
    expect<symbol>(allowNil).toBe(Symbol.for('@meld-ts/core/fetch:allowNil'));
  });
});
