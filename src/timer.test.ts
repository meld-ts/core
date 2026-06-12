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

// ── 工厂 API 测试 ──────────────────────────────────────────

describe('createTimer', () => {
  test('set() fires callback and returns cleanup function', async () => {
    let called = false;
    const t = createTimer('test:');
    const clear = t.set('fire', () => { called = true; }, 20);
    expect(typeof clear).toBe('function');
    await Bun.sleep(50);
    expect(called).toBe(true);
  });

  test('set() replaces existing timer on same key', async () => {
    let count = 0;
    const t = createTimer('test:');
    t.set('dup', () => { count++; }, 30);
    t.set('dup', () => { count += 10; }, 30);
    await Bun.sleep(60);
    expect(count).toBe(10);
  });

  test('returned cleanup function clears the timer', async () => {
    let called = false;
    const t = createTimer('test:');
    const clear = t.set('cancel', () => { called = true; }, 20);
    clear();
    await Bun.sleep(50);
    expect(called).toBe(false);
  });

  test('clear() removes a specific timer', async () => {
    let called = false;
    const t = createTimer('test:');
    t.set('x', () => { called = true; }, 20);
    t.clear('x');
    await Bun.sleep(50);
    expect(called).toBe(false);
  });

  test('clearAll() removes all timers for this instance', async () => {
    let a = 0;
    let b = 0;
    const t = createTimer('test:');
    t.set('a', () => { a++; }, 20);
    t.set('b', () => { b++; }, 20);
    t.clearAll();
    await Bun.sleep(50);
    expect(a).toBe(0);
    expect(b).toBe(0);
  });

  test('different instances with different prefixes do not interfere', async () => {
    let x = 0;
    let y = 0;
    const t1 = createTimer('a:');
    const t2 = createTimer('b:');
    t1.set('t', () => { x++; }, 20);
    t2.set('t', () => { y++; }, 20);
    await Bun.sleep(50);
    expect(x).toBe(1);
    expect(y).toBe(1);
    // clearAll on t1 should not affect t2
    t1.clearAll();
    let z = 0;
    t2.set('z', () => { z++; }, 20);
    await Bun.sleep(50);
    expect(z).toBe(1);
  });
});

describe('createTicker', () => {
  test('set() fires callback repeatedly and returns cleanup', async () => {
    let count = 0;
    const t = createTicker('test:');
    const clear = t.set('tick', () => { count++; }, 20);
    await Bun.sleep(90);
    clear();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('returned cleanup function stops the ticker', async () => {
    let count = 0;
    const t = createTicker('test:');
    const clear = t.set('stop', () => { count++; }, 20);
    await Bun.sleep(50);
    const snapshot = count;
    clear();
    await Bun.sleep(50);
    expect(count).toBe(snapshot);
  });

  test('clearAll() removes all tickers for this instance', async () => {
    let a = 0;
    let b = 0;
    const t = createTicker('test:');
    t.set('a', () => { a++; }, 20);
    t.set('b', () => { b++; }, 20);
    t.clearAll();
    await Bun.sleep(50);
    expect(a).toBe(0);
    expect(b).toBe(0);
  });
});
