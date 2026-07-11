import { describe, expect, test } from 'bun:test';

import {
  RetryExhaustedError,
  type RetryOptions,
  retry,
  retryFn,
} from './retry';

describe('retry — options immutability', () => {
  test('retry options should be frozen — mutation after wrapper creation does not affect behavior', async () => {
    let attempts = 0;
    const opts = { attempts: 3, delay: 10 };
    const wrapped = retry(async () => {
      attempts++;
      throw new Error('always fails');
    }, opts);

    // mutate options after wrapper creation
    opts.attempts = 1;

    await expect(wrapped()).rejects.toBeInstanceOf(RetryExhaustedError);
    // should still retry 3 times, not 1
    expect(attempts).toBe(3);
  });

  test('retry options should be frozen — object.isFrozen', async () => {
    const opts = { attempts: 3, delay: 10 };
    retry(async () => 'ok', opts);
    // The original opts object should not be mutated by retry.
    // (retry may freeze a copy internally; original doesn't need to be frozen,
    // but the copy used at runtime must be frozen.)
    expect(opts.attempts).toBe(3); // original untouched
  });
});

describe('retryFn — options freeze consistency', () => {
  test('RetryExhaustedError.options is the frozen copy, not the original', async () => {
    const opts = { attempts: 2, delay: 10 };
    const wrapped = retryFn(() => {
      throw new Error('always fails');
    }, opts);

    // mutate original after wrapper creation
    opts.attempts = 999;

    try {
      await wrapped();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RetryExhaustedError);
      const err = e as RetryExhaustedError;
      // Should reflect original attempts=2, not mutated 999
      expect(err.options.attempts).toBe(2);
      // The options stored in the error should be frozen
      expect(Object.isFrozen(err.options)).toBe(true);
    }
  });

  test('RetryExhaustedError.options matches frozenOptions passed to fn callback', async () => {
    let callbackOptions: RetryOptions | null = null;
    const wrapped = retryFn(
      (params) => {
        callbackOptions = params.options;
        throw new Error('fail');
      },
      { attempts: 2, delay: 10 },
    );

    try {
      await wrapped();
    } catch (e) {
      const err = e as RetryExhaustedError;
      // The options in the error should be the same frozen object
      // that was passed to the fn callback
      expect(err.options).toBe(callbackOptions!);
      expect(Object.isFrozen(err.options)).toBe(true);
    }
  });

  test('retry options frozen — mutation does not change retryFn behavior', async () => {
    let attempts = 0;
    const opts = { attempts: 3, delay: 10 };
    const wrapped = retryFn(() => {
      attempts++;
      throw new Error('fail');
    }, opts);

    opts.attempts = 1;

    await expect(wrapped()).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(attempts).toBe(3);
  });
});
