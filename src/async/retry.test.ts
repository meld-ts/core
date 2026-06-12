import { describe, expect, test } from 'bun:test';

import { TimeoutError } from './errors';
import {
  RetryExhaustedError,
  type RetryFnParams,
  retry,
  retryFn,
  sleep,
  timeout,
} from './retry';

describe('retry', () => {
  describe('retry', () => {
    test('should return a wrapped function, not execute immediately', () => {
      let called = false;
      const fn = async () => {
        called = true;
        return 'success';
      };
      const wrapped = retry(fn);
      expect(typeof wrapped).toBe('function');
      expect(called).toBe(false);
    });

    test('should return result on first success', async () => {
      const wrapped = retry(async () => 'success');
      const result = await wrapped();
      expect(result).toBe('success');
    });

    test('should preserve original function parameters', async () => {
      const fn = async (a: number, b: string) => `${a}-${b}`;
      const wrapped = retry(fn, { attempts: 3, delay: 10 });
      const result = await wrapped(42, 'hello');
      expect(result).toBe('42-hello');
    });

    test('should support sync functions', async () => {
      const fn = (x: number) => x * 2;
      const wrapped = retry(fn);
      const result = await wrapped(5);
      expect(result).toBe(10);
    });

    test('should retry on failure and succeed', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };

      const wrapped = retry(fn, { attempts: 5, delay: 10 });
      const result = await wrapped();
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should throw RetryExhaustedError after max attempts', async () => {
      let attempts = 0;
      const opts = { attempts: 3, delay: 10 };
      const fn = async () => {
        attempts++;
        throw new Error('always fails');
      };

      const wrapped = retry(fn, opts);
      try {
        await wrapped();
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RetryExhaustedError);
        const err = e as RetryExhaustedError;
        expect(err.attempt).toBe(3);
        expect(err.error).toBeInstanceOf(Error);
        expect(err.options).toBe(opts);
      }
      expect(attempts).toBe(3);
    });

    test('should call onRetry with RetryFnParams', async () => {
      let attempts = 0;
      const params: RetryFnParams[] = [];
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };

      const wrapped = retry(fn, {
        attempts: 5,
        delay: 10,
        onRetry: (p) => params.push({ ...p }),
      });
      await wrapped();

      expect(params.length).toBe(2);
      expect(params[0].attempt).toBe(1);
      expect(params[0].error).toBeInstanceOf(Error);
      expect(params[1].attempt).toBe(2);
    });

    test('should support delay as function with RetryFnParams', async () => {
      let attempts = 0;
      const delays: number[] = [];
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };

      const wrapped = retry(fn, {
        attempts: 5,
        delay: ({ attempt }) => {
          const d = Math.min(10 * 2 ** (attempt - 1), 50);
          delays.push(d);
          return d;
        },
      });
      await wrapped();

      expect(delays).toEqual([10, 20]);
    });

    test('should isolate state between calls', async () => {
      let total = 0;
      const fn = async () => {
        total++;
        if (total % 2 === 1) throw new Error('odd fails');
        return total;
      };

      const wrapped = retry(fn, { attempts: 2, delay: 10 });
      const result = await wrapped();
      expect(result).toBe(2);
    });
  });

  describe('retryFn', () => {
    test('should pass RetryFnParams to fn', async () => {
      const receivedParams: RetryFnParams[] = [];
      const wrapped = retryFn(
        (params) => {
          receivedParams.push({ ...params });
          if (params.attempt < 2) throw new Error('fail');
          return 'ok';
        },
        { attempts: 3, delay: 10 },
      );

      await wrapped();
      expect(receivedParams.length).toBe(2);
      expect(receivedParams[0].attempt).toBe(1);
      expect(receivedParams[0].error).toBeUndefined();
      expect(receivedParams[1].attempt).toBe(2);
      expect(receivedParams[1].error).toBeInstanceOf(Error);
    });

    test('should strip RetryFnParams from returned function signature', async () => {
      const wrapped = retryFn(
        (_params, id: string, count: number) => {
          return { id, count };
        },
        { attempts: 3 },
      );

      const result = await wrapped('abc', 42);
      expect(result).toEqual({ id: 'abc', count: 42 });
    });

    test('should allow switching logic based on attempt', async () => {
      const sources: string[] = [];
      const wrapped = retryFn(
        ({ attempt }, id: string) => {
          const source = attempt === 1 ? 'primary' : 'fallback';
          sources.push(source);
          if (attempt === 1) throw new Error('primary down');
          return { id, source };
        },
        { attempts: 3, delay: 10 },
      );

      const result = await wrapped('123');
      expect(result).toEqual({ id: '123', source: 'fallback' });
      expect(sources).toEqual(['primary', 'fallback']);
    });

    test('should freeze options passed to fn', async () => {
      const wrapped = retryFn(
        (params) => {
          expect(() => {
            (params.options as Record<string, unknown>).attempts = 999;
          }).toThrow();
          return 'ok';
        },
        { attempts: 1 },
      );

      await wrapped();
    });

    test('should throw RetryExhaustedError when all attempts fail', async () => {
      const wrapped = retryFn(
        () => {
          throw new Error('always fails');
        },
        { attempts: 2, delay: 10 },
      );

      await expect(wrapped()).rejects.toThrow(RetryExhaustedError);
    });
  });

  describe('timeout', () => {
    test('should return a wrapped function, not execute immediately', () => {
      let called = false;
      const fn = async () => {
        called = true;
        return 'done';
      };
      const wrapped = timeout(fn, 1000);
      expect(typeof wrapped).toBe('function');
      expect(called).toBe(false);
    });

    test('should return result if completed within timeout', async () => {
      const wrapped = timeout(async () => {
        await Bun.sleep(10);
        return 'done';
      }, 1000);
      const result = await wrapped();
      expect(result).toBe('done');
    });

    test('should preserve original function parameters', async () => {
      const fn = async (a: number, b: string) => `${a}-${b}`;
      const wrapped = timeout(fn, 1000);
      const result = await wrapped(42, 'hello');
      expect(result).toBe('42-hello');
    });

    test('should support sync functions', async () => {
      const fn = (x: number) => x * 2;
      const wrapped = timeout(fn, 1000);
      const result = await wrapped(5);
      expect(result).toBe(10);
    });

    test('should throw TimeoutError if exceeded', async () => {
      const wrapped = timeout(async () => {
        await Bun.sleep(100);
        return 'done';
      }, 10);
      await expect(wrapped()).rejects.toThrow(TimeoutError);
    });

    test('no TimeoutError after fn resolves early', async () => {
      // Verifies the early-resolution path: fn completes well within the timeout,
      // result is returned correctly, and sleeping past the timeout window causes
      // no errors. The .finally(clearTimeout) in the implementation prevents the
      // stray timer from keeping the process alive in test environments.
      const wrapped = timeout(async () => {
        await Bun.sleep(10);
        return 'done';
      }, 60);
      expect(await wrapped()).toBe('done');
      await Bun.sleep(80);
    });
  });

  describe('sleep', () => {
    test('should wait specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });

    test('should return void without fn', async () => {
      const result = await sleep(10);
      expect(result).toBeUndefined();
    });

    test('should execute fn after delay and return result', async () => {
      const start = Date.now();
      const result = await sleep(50, () => 'done');
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
      expect(result).toBe('done');
    });

    test('should support async fn', async () => {
      const result = await sleep(10, async () => {
        return { id: 1 };
      });
      expect(result).toEqual({ id: 1 });
    });
  });
});
