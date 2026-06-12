import { afterEach, describe, expect, test } from 'bun:test';
import {
  clearAllTickers,
  clearAllTimers,
  clearTicker,
  clearTimer,
  ticker,
  timer,
} from './timer';

let seq = 0;
const key = (label: string) => `test:${label}:${++seq}`;

afterEach(() => {
  clearAllTimers();
  clearAllTickers();
});

describe('timer', () => {
  test('fires callback after delay', async () => {
    let called = false;
    timer(
      key('fire'),
      () => {
        called = true;
      },
      20,
    );
    expect(called).toBe(false);
    await Bun.sleep(50);
    expect(called).toBe(true);
  });

  test('replaces existing timer on same key', async () => {
    let count = 0;
    const k = key('replace');
    timer(
      k,
      () => {
        count++;
      },
      30,
    );
    timer(
      k,
      () => {
        count++;
      },
      30,
    );
    await Bun.sleep(60);
    expect(count).toBe(1);
  });

  test('clearTimer prevents callback from firing', async () => {
    let called = false;
    const k = key('clear');
    timer(
      k,
      () => {
        called = true;
      },
      30,
    );
    clearTimer(k);
    await Bun.sleep(60);
    expect(called).toBe(false);
  });

  test('clearTimer is a noop for unknown key', () => {
    expect(() => clearTimer('nonexistent:key:999')).not.toThrow();
  });

  test('supports async callback', async () => {
    let resolved = false;
    timer(
      key('async'),
      async () => {
        await Bun.sleep(5);
        resolved = true;
      },
      20,
    );
    await Bun.sleep(60);
    expect(resolved).toBe(true);
  });

  test('rejected async callback does not throw unhandled rejection', async () => {
    let rejected = false;
    timer(
      key('reject'),
      async () => {
        rejected = true;
        throw new Error('callback error');
      },
      20,
    );
    await Bun.sleep(60);
    expect(rejected).toBe(true);
    // async reject → Promise.catch → console.error
  });

  test('sync throw does not cause uncaught exception', async () => {
    let thrown = false;
    timer(
      key('sync-throw'),
      () => {
        thrown = true;
        throw new Error('sync boom');
      },
      20,
    );
    await Bun.sleep(60);
    expect(thrown).toBe(true);
    // sync throw → try/catch → console.error
  });

  test('key "toString" does not collide with prototype', () => {
    expect(() => clearTimer('toString')).not.toThrow();
    // Object.hasOwn prevents prototype key collision
  });
});

describe('ticker', () => {
  test('fires callback multiple times', async () => {
    let count = 0;
    const k = key('tick');
    ticker(
      k,
      () => {
        count++;
      },
      20,
    );
    await Bun.sleep(90);
    clearTicker(k);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('replaces existing ticker on same key', async () => {
    let count = 0;
    const k = key('replace-tick');
    ticker(
      k,
      () => {
        count++;
      },
      20,
    );
    ticker(
      k,
      () => {
        count += 10;
      },
      20,
    );
    await Bun.sleep(50);
    clearTicker(k);
    expect(count % 10).toBe(0);
    expect(count).toBeGreaterThan(0);
  });

  test('clearTicker stops the ticker', async () => {
    let count = 0;
    const k = key('stop');
    ticker(
      k,
      () => {
        count++;
      },
      20,
    );
    await Bun.sleep(50);
    const snapshot = count;
    clearTicker(k);
    await Bun.sleep(50);
    expect(count).toBe(snapshot);
  });

  test('clearTicker is a noop for unknown key', () => {
    expect(() => clearTicker('nonexistent:key:999')).not.toThrow();
  });

  test('sync throw does not cause uncaught exception in ticker', async () => {
    let thrown = false;
    const k = key('tick-sync-throw');
    ticker(
      k,
      () => {
        thrown = true;
        throw new Error('tick sync boom');
      },
      20,
    );
    await Bun.sleep(30);
    clearTicker(k);
    expect(thrown).toBe(true);
    // sync throw → try/catch → console.error
  });
});

describe('clearAllTimers', () => {
  test('clears all named timers', async () => {
    let count = 0;
    timer(
      'a',
      () => {
        count++;
      },
      20,
    );
    timer(
      'b',
      () => {
        count++;
      },
      20,
    );
    clearAllTimers();
    await Bun.sleep(50);
    expect(count).toBe(0);
  });
});

describe('clearAllTickers', () => {
  test('clears all named tickers', async () => {
    let count = 0;
    ticker(
      'x',
      () => {
        count++;
      },
      20,
    );
    ticker(
      'y',
      () => {
        count++;
      },
      20,
    );
    clearAllTickers();
    await Bun.sleep(50);
    expect(count).toBe(0);
  });
});
