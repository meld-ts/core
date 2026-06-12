import { afterEach, describe, expect, test } from 'bun:test';

import {
  PendingScopeConflictError,
  clearPendingRegistry,
  pending,
  pendingFn,
} from './pending';

afterEach(() => {
  clearPendingRegistry();
});

describe('pending', () => {
  describe('scope registration', () => {
    test('should throw on duplicate static scope', () => {
      pending('dup-scope', async () => 'a');
      expect(() => pending('dup-scope', async () => 'b')).toThrow(
        PendingScopeConflictError,
      );
    });

    test('should allow different static scopes', () => {
      expect(() => {
        pending('scope-a', async () => 'a');
        pending('scope-b', async () => 'b');
      }).not.toThrow();
    });

    test('should not conflict between static and dynamic scopes', () => {
      pending('user', async () => 'static');
      expect(() => {
        pending(
          (id: string) => `user:${id}`,
          async (id: string) => id,
        );
      }).not.toThrow();
    });

    test('clearRegistry should allow reusing scopes', () => {
      pending('reuse', async () => 'first');
      clearPendingRegistry();
      expect(() => pending('reuse', async () => 'second')).not.toThrow();
    });
  });

  describe('static scope dedup', () => {
    test('should execute fn only once for concurrent calls', async () => {
      let execCount = 0;
      const fn = pending('single-exec', async () => {
        execCount++;
        await Bun.sleep(50);
        return 'result';
      });

      const [a, b, c] = await Promise.all([fn(), fn(), fn()]);

      expect(execCount).toBe(1);
      expect(a).toBe('result');
      expect(b).toBe('result');
      expect(c).toBe('result');
    });

    test('should share the same promise reference', async () => {
      const fn = pending('same-promise', async () => {
        await Bun.sleep(30);
        return { id: 1 };
      });

      const p1 = fn();
      const p2 = fn();
      expect(p1).toBe(p2);
      await Promise.all([p1, p2]);
    });

    test('should start new execution after previous completes', async () => {
      let execCount = 0;
      const fn = pending('new-cycle', async () => {
        execCount++;
        await Bun.sleep(20);
        return execCount;
      });

      const first = await fn();
      expect(first).toBe(1);

      const second = await fn();
      expect(second).toBe(2);
      expect(execCount).toBe(2);
    });

    test('should reject all callers on error', async () => {
      let execCount = 0;
      const fn = pending('reject-all', async () => {
        execCount++;
        await Bun.sleep(30);
        throw new Error('boom');
      });

      const results = await Promise.allSettled([fn(), fn(), fn()]);

      expect(execCount).toBe(1);
      for (const r of results) {
        expect(r.status).toBe('rejected');
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(Error);
          expect((r.reason as Error).message).toBe('boom');
        }
      }
    });

    test('should allow new execution after rejection', async () => {
      let execCount = 0;
      const fn = pending('recover-after-reject', async () => {
        execCount++;
        if (execCount === 1) throw new Error('first fail');
        return 'ok';
      });

      await expect(fn()).rejects.toThrow('first fail');
      const result = await fn();
      expect(result).toBe('ok');
      expect(execCount).toBe(2);
    });
  });

  describe('dynamic scope dedup', () => {
    test('should dedup by generated key', async () => {
      let execCount = 0;
      const fn = pending(
        (id: string) => `item:${id}`,
        async (id: string) => {
          execCount++;
          await Bun.sleep(50);
          return `data-${id}`;
        },
      );

      const [a, b] = await Promise.all([fn('1'), fn('1')]);
      expect(execCount).toBe(1);
      expect(a).toBe('data-1');
      expect(b).toBe('data-1');
    });

    test('should execute independently for different keys', async () => {
      let execCount = 0;
      const fn = pending(
        (id: string) => `item:${id}`,
        async (id: string) => {
          execCount++;
          await Bun.sleep(30);
          return `data-${id}`;
        },
      );

      const [a, b] = await Promise.all([fn('1'), fn('2')]);
      expect(execCount).toBe(2);
      expect(a).toBe('data-1');
      expect(b).toBe('data-2');
    });

    test('should allow multiple dynamic scope pending without conflict', () => {
      const fn1 = pending(
        (id: string) => `a:${id}`,
        async (id: string) => id,
      );
      const fn2 = pending(
        (id: string) => `b:${id}`,
        async (id: string) => id,
      );
      expect(typeof fn1).toBe('function');
      expect(typeof fn2).toBe('function');
    });
  });

  describe('sync function support', () => {
    test('should handle sync functions', async () => {
      let execCount = 0;
      const fn = pending('sync-fn', (x: number) => {
        execCount++;
        return x * 2;
      });

      const result = await fn(5);
      expect(result).toBe(10);
      expect(execCount).toBe(1);
    });

    test('should catch sync throws and reject all', async () => {
      let execCount = 0;
      const fn = pending('sync-throw', () => {
        execCount++;
        throw new Error('sync error');
      });

      // 同步抛出需要先触发再等一下让 pending 生效
      const p1 = fn();
      const results = await Promise.allSettled([p1]);

      expect(execCount).toBe(1);
      expect(results[0].status).toBe('rejected');
    });
  });

  describe('preserves function signature', () => {
    test('should preserve parameters and return type', async () => {
      const fn = pending('typed', async (a: number, b: string) => ({ a, b }));

      const result = await fn(42, 'hello');
      expect(result).toEqual({ a: 42, b: 'hello' });
    });
  });
});

describe('pendingFn', () => {
  describe('scope registration', () => {
    test('should throw on duplicate static scope', () => {
      pendingFn('pfn-dup', (params) => params.scope);
      expect(() => pendingFn('pfn-dup', (params) => params.scope)).toThrow(
        PendingScopeConflictError,
      );
    });

    test('should conflict with pending using same static scope', () => {
      pending('shared-scope', async () => 'a');
      expect(() => pendingFn('shared-scope', (params) => params.scope)).toThrow(
        PendingScopeConflictError,
      );
    });
  });

  describe('params injection', () => {
    test('should pass scope to fn', async () => {
      let receivedScope = '';
      const fn = pendingFn('pfn-scope', ({ scope }) => {
        receivedScope = scope;
        return 'ok';
      });

      await fn();
      expect(receivedScope).toBe('pfn-scope');
    });

    test('should pass dynamic scope to fn', async () => {
      let receivedScope = '';
      const fn = pendingFn(
        (id: string) => `pfn:${id}`,
        ({ scope }, _id: string) => {
          receivedScope = scope;
          return 'ok';
        },
      );

      await fn('abc');
      expect(receivedScope).toBe('pfn:abc');
    });

    test('should track pending count in real-time', async () => {
      const counts: number[] = [];

      const fn = pendingFn('pfn-count', async ({ getPendingCount }) => {
        // 记录初始状态
        counts.push(getPendingCount());
        // 等待让其他 callers 进来
        await Bun.sleep(50);
        // 记录累积后的状态
        counts.push(getPendingCount());
        return 'done';
      });

      const results = await Promise.all([fn(), fn(), fn()]);

      // 初始时 0 个等待者
      expect(counts[0]).toBe(0);
      // 等待期间 2 个额外 callers 进来
      expect(counts[1]).toBe(2);
      // 所有结果相同
      expect(results).toEqual(['done', 'done', 'done']);
    });
  });

  describe('dedup behavior', () => {
    test('should execute fn only once for concurrent calls', async () => {
      let execCount = 0;
      const fn = pendingFn('pfn-dedup', async () => {
        execCount++;
        await Bun.sleep(50);
        return 'result';
      });

      const [a, b, c] = await Promise.all([fn(), fn(), fn()]);
      expect(execCount).toBe(1);
      expect(a).toBe('result');
      expect(b).toBe('result');
      expect(c).toBe('result');
    });

    test('should reject all callers on error', async () => {
      let execCount = 0;
      const fn = pendingFn('pfn-reject', async () => {
        execCount++;
        await Bun.sleep(30);
        throw new Error('boom');
      });

      const results = await Promise.allSettled([fn(), fn()]);
      expect(execCount).toBe(1);
      for (const r of results) {
        expect(r.status).toBe('rejected');
      }
    });

    test('should start new cycle after completion', async () => {
      let execCount = 0;
      const fn = pendingFn('pfn-cycle', async ({ scope }) => {
        execCount++;
        return `${scope}:${execCount}`;
      });

      const first = await fn();
      expect(first).toBe('pfn-cycle:1');

      const second = await fn();
      expect(second).toBe('pfn-cycle:2');
    });
  });

  describe('strip PendingFnParams from signature', () => {
    test('should only expose business args', async () => {
      const fn = pendingFn(
        (a: number, b: string) => `key:${a}:${b}`,
        (_params, a: number, b: string) => ({ a, b }),
      );

      const result = await fn(42, 'hello');
      expect(result).toEqual({ a: 42, b: 'hello' });
    });
  });

  describe('short-circuit pattern', () => {
    test('should support early return based on scope', async () => {
      const cache = new Map<string, string>();
      let execCount = 0;

      const fn = pendingFn(
        (key: string) => `cache:${key}`,
        async ({ scope }, key: string) => {
          // 短路检查
          const cached = cache.get(scope);
          if (cached) return cached;

          // 实际执行
          execCount++;
          await Bun.sleep(30);
          const value = `value-${key}`;
          cache.set(scope, value);
          return value;
        },
      );

      // 第一次：执行
      const a = await fn('x');
      expect(a).toBe('value-x');
      expect(execCount).toBe(1);

      // 第二次：短路返回缓存（fn 执行了但走了 cache 分支）
      const b = await fn('x');
      expect(b).toBe('value-x');
      expect(execCount).toBe(1);
    });
  });
});
