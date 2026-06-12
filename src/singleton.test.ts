import { describe, expect, test } from 'bun:test';
import { singleton } from './singleton';

describe('singleton (sync)', () => {
  test('factory is called only once', () => {
    let calls = 0;
    const get = singleton(() => {
      calls++;
      return { value: calls };
    });
    get();
    get();
    get();
    expect(calls).toBe(1);
  });

  test('always returns the same reference', () => {
    const get = singleton(() => ({ id: Math.random() }));
    const a = get();
    const b = get();
    expect(a).toBe(b);
  });

  test('factory args are only used on first call', () => {
    const get = singleton((x: number) => x * 2);
    expect(get(5)).toBe(10);
    expect(get(999)).toBe(10); // second call, args ignored
  });
});

describe('singleton (async)', () => {
  test('factory is called only once', async () => {
    let calls = 0;
    const get = singleton(async () => {
      calls++;
      await Bun.sleep(20);
      return { value: calls };
    });
    await get();
    await get();
    expect(calls).toBe(1);
  });

  test('always resolves to the same value', async () => {
    const get = singleton(async () => ({ id: Math.random() }));
    const a = await get();
    const b = await get();
    expect(a).toBe(b);
  });

  test('concurrent calls share one inflight promise, factory runs once', async () => {
    let calls = 0;
    const get = singleton(async () => {
      calls++;
      await Bun.sleep(30);
      return calls;
    });

    const [a, b, c] = await Promise.all([get(), get(), get()]);

    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(c).toBe(1);
  });

  test('returns resolved value immediately after first resolution', async () => {
    const get = singleton(async () => {
      await Bun.sleep(10);
      return 42;
    });

    await get(); // resolve
    const result = await get(); // should return from cache
    expect(result).toBe(42);
  });

  test('factory reject clears inflight — next call retries', async () => {
    let calls = 0;
    const get = singleton(async () => {
      calls++;
      if (calls === 1) throw new Error('first attempt fails');
      return calls;
    });

    await expect(get()).rejects.toThrow('first attempt fails');
    expect(calls).toBe(1);

    // inflight cleared by .finally(); second call must invoke the factory again
    const result = await get();
    expect(calls).toBe(2);
    expect(result).toBe(2);
  });

  test('concurrent calls after a reject all share the new inflight', async () => {
    let calls = 0;
    const get = singleton(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      await Bun.sleep(20);
      return calls;
    });

    await get().catch(() => {});
    const [a, b] = await Promise.all([get(), get()]);
    expect(calls).toBe(2); // retried once, not twice
    expect(a).toBe(b);
  });
});
