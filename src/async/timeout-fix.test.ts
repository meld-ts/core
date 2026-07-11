import { describe, expect, test } from 'bun:test';

import { TimeoutError } from './errors';
import { timeout } from './retry';

describe('timeout — unhandled rejection guard', () => {
  test('fn rejects after timeout wins should not produce unhandled rejection', async () => {
    let unhandledCount = 0;
    const handler = () => {
      unhandledCount++;
    };
    process.on('unhandledRejection', handler);

    try {
      const wrapped = timeout(async () => {
        await Bun.sleep(100);
        throw new Error('late failure');
      }, 10);

      // timeout fires at ~10ms, fn rejects at ~100ms
      await expect(wrapped()).rejects.toBeInstanceOf(TimeoutError);

      // wait long enough for fn's delayed rejection to arrive
      await Bun.sleep(150);

      expect(unhandledCount).toBe(0);
    } finally {
      process.off('unhandledRejection', handler);
    }
  });

  test('fn rejects before timeout still propagates the original error', async () => {
    const wrapped = timeout(async () => {
      throw new Error('immediate failure');
    }, 1000);
    await expect(wrapped()).rejects.toThrow('immediate failure');
  });

  test('fn resolves after timeout wins — no unhandled rejection', async () => {
    let unhandledCount = 0;
    const handler = () => {
      unhandledCount++;
    };
    process.on('unhandledRejection', handler);

    try {
      const wrapped = timeout(async () => {
        await Bun.sleep(100);
        return 'late success';
      }, 10);

      await expect(wrapped()).rejects.toBeInstanceOf(TimeoutError);
      await Bun.sleep(150);

      expect(unhandledCount).toBe(0);
    } finally {
      process.off('unhandledRejection', handler);
    }
  });
});
