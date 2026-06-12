import { describe, expect, test } from 'bun:test';
import { createTicker, createTimer } from './timer';

let seq = 0;
const key = (label: string) => `test:${label}:${++seq}`;

// ── createTimer ──────────────────────────────────────────

describe('createTimer', () => {
  test('set() fires callback after delay', async () => {
    let called = false;
    const t = createTimer('');
    t.set(
      key('fire'),
      () => {
        called = true;
      },
      20,
    );
    await Bun.sleep(50);
    expect(called).toBe(true);
  });

  test('set() replaces existing timer on same key', async () => {
    let count = 0;
    const t = createTimer('');
    t.set('dup-test', () => { count++; }, 30);
    t.set('dup-test', () => { count += 10; }, 30);
    await Bun.sleep(60);
    expect(count).toBe(10);
  });

  test('returned cleanup function clears the timer', async () => {
    let called = false;
    const t = createTimer('');
    const clear = t.set(
      key('cancel'),
      () => {
        called = true;
      },
      20,
    );
    clear();
    await Bun.sleep(50);
    expect(called).toBe(false);
  });

  test('clear() removes a specific timer', async () => {
    let called = false;
    const t = createTimer('');
    const k = key('x');
    t.set(
      k,
      () => {
        called = true;
      },
      20,
    );
    t.clear(k);
    await Bun.sleep(50);
    expect(called).toBe(false);
  });

  test('clearAll() removes all timers for this instance', async () => {
    let a = 0;
    let b = 0;
    const t = createTimer('');
    t.set(
      key('a'),
      () => {
        a++;
      },
      20,
    );
    t.set(
      key('b'),
      () => {
        b++;
      },
      20,
    );
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
    t1.set(
      't',
      () => {
        x++;
      },
      20,
    );
    t2.set(
      't',
      () => {
        y++;
      },
      20,
    );
    await Bun.sleep(50);
    expect(x).toBe(1);
    expect(y).toBe(1);
    t1.clearAll();
    let z = 0;
    t2.set(
      'z',
      () => {
        z++;
      },
      20,
    );
    await Bun.sleep(50);
    expect(z).toBe(1);
  });

  test('supports async callback', async () => {
    let resolved = false;
    const t = createTimer('');
    t.set(
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

  test('rejected async callback does not cause unhandled rejection', async () => {
    let rejected = false;
    const t = createTimer('');
    t.set(
      key('reject'),
      async () => {
        rejected = true;
        throw new Error('callback error');
      },
      20,
    );
    await Bun.sleep(60);
    expect(rejected).toBe(true);
  });

  test('sync throw does not cause uncaught exception', async () => {
    let thrown = false;
    const t = createTimer('');
    t.set(
      key('sync-throw'),
      () => {
        thrown = true;
        throw new Error('sync boom');
      },
      20,
    );
    await Bun.sleep(60);
    expect(thrown).toBe(true);
  });

  test('key "toString" does not collide with prototype', () => {
    const t = createTimer('');
    expect(() => t.clear('toString')).not.toThrow();
  });
});

// ── createTicker ──────────────────────────────────────────

describe('createTicker', () => {
  test('set() fires callback repeatedly', async () => {
    let count = 0;
    const t = createTicker('');
    const clear = t.set(
      key('tick'),
      () => {
        count++;
      },
      20,
    );
    await Bun.sleep(90);
    clear();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('set() replaces existing ticker on same key', async () => {
    let count = 0;
    const t = createTicker('');
    const k = key('replace');
    t.set(
      k,
      () => {
        count++;
      },
      20,
    );
    t.set(
      k,
      () => {
        count += 10;
      },
      20,
    );
    await Bun.sleep(50);
    const clear = t.set('dummy', () => {}, 999);
    expect(count % 10).toBe(0);
    expect(count).toBeGreaterThan(0);
    clear();
  });

  test('returned cleanup function stops the ticker', async () => {
    let count = 0;
    const t = createTicker('');
    const clear = t.set(
      key('stop'),
      () => {
        count++;
      },
      20,
    );
    await Bun.sleep(50);
    const snapshot = count;
    clear();
    await Bun.sleep(50);
    expect(count).toBe(snapshot);
  });

  test('clear() is noop for unknown key', () => {
    const t = createTicker('');
    expect(() => t.clear('nonexistent:key:999')).not.toThrow();
  });

  test('clearAll() removes all tickers for this instance', async () => {
    let a = 0;
    let b = 0;
    const t = createTicker('');
    t.set(
      key('a'),
      () => {
        a++;
      },
      20,
    );
    t.set(
      key('b'),
      () => {
        b++;
      },
      20,
    );
    t.clearAll();
    await Bun.sleep(50);
    expect(a).toBe(0);
    expect(b).toBe(0);
  });

  test('sync throw does not cause uncaught exception in ticker', async () => {
    let thrown = false;
    const t = createTicker('');
    const clear = t.set(
      key('tick-sync-throw'),
      () => {
        thrown = true;
        throw new Error('tick sync boom');
      },
      20,
    );
    await Bun.sleep(30);
    clear();
    expect(thrown).toBe(true);
  });
});
