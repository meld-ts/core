import { describe, expect, it } from 'bun:test';
import { TimeoutError } from './errors';
import {
  RpcAbortError,
  StatefulRpc,
  type StatefulRpcTask,
} from './StatefulRpc';

// ============================================================================
// Basic pending / settle
// ============================================================================

describe('StatefulRpc - basic', () => {
  it('resolve delivers result to pending caller', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p = rpc.pending('req', 'data');
    rpc.resolve('req', 42);
    expect(await p).toBe(42);
  });

  it('reject delivers error to pending caller', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p = rpc.pending('req', 'data');
    rpc.reject('req', new Error('boom'));
    await expect(p).rejects.toThrow('boom');
  });

  it('settle returns this for chaining', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p = rpc.pending('req', 'data');
    expect(rpc.resolve('req', 1)).toBe(rpc);
    await p;
  });

  it('resolve on unknown key is a no-op', () => {
    const rpc = new StatefulRpc<number, string>();
    expect(() => rpc.resolve('ghost', 1)).not.toThrow();
  });

  it('reject on unknown key is a no-op', () => {
    const rpc = new StatefulRpc<number, string>();
    expect(() => rpc.reject('ghost', new Error())).not.toThrow();
  });

  it('key is freed after resolve — re-pending succeeds', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('req', 'a');
    rpc.resolve('req', 1);
    await p1;
    const p2 = rpc.pending('req', 'b');
    rpc.resolve('req', 2);
    expect(await p2).toBe(2);
  });

  it('task.params carries the value passed to pending()', async () => {
    let capturedParams: unknown;
    const rpc = new StatefulRpc<number, { token: string }>({
      events: {
        pending: ({ task }) => {
          capturedParams = task.params;
        },
      },
    });
    const p = rpc.pending('r', { token: 'abc' });
    rpc.resolve('r', 1);
    await p;
    expect(capturedParams).toEqual({ token: 'abc' });
  });

  it('task is frozen', async () => {
    let captured: StatefulRpcTask<string> | undefined;
    const rpc = new StatefulRpc<number, string>({
      events: {
        pending: ({ task }) => {
          captured = task;
        },
      },
    });
    const p = rpc.pending('r', 'd');
    rpc.resolve('r', 1);
    await p;
    expect(Object.isFrozen(captured)).toBe(true);
  });
});

// ============================================================================
// Multiple tasks per key
// ============================================================================

describe('StatefulRpc - multiple tasks per key', () => {
  it('same key accepts multiple concurrent callers', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('k', 'first');
    const p2 = rpc.pending('k', 'second');
    rpc.resolve('k', 99);
    expect(await p1).toBe(99);
    expect(await p2).toBe(99);
  });

  it('resolve settles all tasks for the key atomically', async () => {
    const rpc = new StatefulRpc<number, string>();
    const results: number[] = [];
    const all = Promise.all([
      rpc.pending('k', 'a').then((r) => results.push(r)),
      rpc.pending('k', 'b').then((r) => results.push(r)),
      rpc.pending('k', 'c').then((r) => results.push(r)),
    ]);
    rpc.resolve('k', 7);
    await all;
    expect(results).toEqual([7, 7, 7]);
  });

  it('each task gets a unique taskId', async () => {
    const taskIds: string[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { pending: ({ task }) => void taskIds.push(task.taskId) },
    });
    const p1 = rpc.pending('k', 'a');
    const p2 = rpc.pending('k', 'b');
    rpc.resolve('k', 1);
    await Promise.all([p1, p2]);
    expect(taskIds).toHaveLength(2);
    expect(taskIds[0]).not.toBe(taskIds[1]);
  });

  it('tasks from different keys settle independently', async () => {
    const rpc = new StatefulRpc<number, string>();
    const pA = rpc.pending('a', 'x');
    const pB = rpc.pending('b', 'y');
    rpc.resolve('a', 1);
    rpc.resolve('b', 2);
    expect(await pA).toBe(1);
    expect(await pB).toBe(2);
  });
});

// ============================================================================
// getPendingCount
// ============================================================================

describe('StatefulRpc - getPendingCount', () => {
  it('starts at 0', () => {
    expect(new StatefulRpc().getPendingCount()).toBe(0);
  });

  it('global count tracks all tasks across keys', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('a', 'x');
    expect(rpc.getPendingCount()).toBe(1);
    const p2 = rpc.pending('a', 'y');
    expect(rpc.getPendingCount()).toBe(2);
    const p3 = rpc.pending('b', 'z');
    expect(rpc.getPendingCount()).toBe(3);
    rpc.clear();
    await Promise.all([p1, p2, p3].map((p) => p.catch(() => {})));
  });

  it('getPendingCount(key) returns count for that key only', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('a', 'x');
    const p2 = rpc.pending('a', 'y');
    const p3 = rpc.pending('b', 'z');
    expect(rpc.getPendingCount('a')).toBe(2);
    expect(rpc.getPendingCount('b')).toBe(1);
    expect(rpc.getPendingCount('unknown')).toBe(0);
    rpc.clear();
    await Promise.all([p1, p2, p3].map((p) => p.catch(() => {})));
  });

  it('decrements after resolve', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p = rpc.pending('a', 'x');
    rpc.resolve('a', 1);
    await p;
    expect(rpc.getPendingCount()).toBe(0);
  });

  it('returns 0 after clear', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('a', 'x');
    const p2 = rpc.pending('b', 'y');
    rpc.clear();
    await Promise.all([p1, p2].map((p) => p.catch(() => {})));
    expect(rpc.getPendingCount()).toBe(0);
  });
});

// ============================================================================
// abort
// ============================================================================

describe('StatefulRpc - abort', () => {
  it('rejects all tasks for the key with RpcAbortError', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('k', 'a');
    const p2 = rpc.pending('k', 'b');
    rpc.abort('k');
    await expect(p1).rejects.toBeInstanceOf(RpcAbortError);
    await expect(p2).rejects.toBeInstanceOf(RpcAbortError);
  });

  it('passes reason to RpcAbortError', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p = rpc.pending('k', 'a');
    rpc.abort('k', 'gone');
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(RpcAbortError);
    expect((err as RpcAbortError).reason).toBe('gone');
  });

  it('only affects the specified key', async () => {
    const rpc = new StatefulRpc<number, string>();
    const pA = rpc.pending('a', 'x');
    const pB = rpc.pending('b', 'y');
    rpc.abort('a');
    await pA.catch(() => {});
    expect(rpc.getPendingCount('b')).toBe(1);
    rpc.resolve('b', 1);
    expect(await pB).toBe(1);
  });

  it('abort on unknown key is a no-op', () => {
    const rpc = new StatefulRpc<number, string>();
    expect(() => rpc.abort('ghost')).not.toThrow();
  });

  it('key is available again after abort', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('k', 'a');
    rpc.abort('k');
    await p1.catch(() => {});
    const p2 = rpc.pending('k', 'b');
    rpc.resolve('k', 99);
    expect(await p2).toBe(99);
  });
});

// ============================================================================
// clear
// ============================================================================

describe('StatefulRpc - clear', () => {
  it('rejects all pending tasks across all keys', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('a', 'x');
    const p2 = rpc.pending('b', 'y');
    rpc.clear();
    await expect(p1).rejects.toBeInstanceOf(RpcAbortError);
    await expect(p2).rejects.toBeInstanceOf(RpcAbortError);
  });

  it('passes reason to all RpcAbortErrors', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p = rpc.pending('a', 'x');
    rpc.clear('disconnected');
    const err = await p.catch((e) => e);
    expect((err as RpcAbortError).reason).toBe('disconnected');
  });

  it('clear with no pending is a no-op', () => {
    const rpc = new StatefulRpc<number, string>();
    expect(() => rpc.clear()).not.toThrow();
  });

  it('pending after clear creates new entry', async () => {
    const rpc = new StatefulRpc<number, string>();
    const p1 = rpc.pending('a', 'x');
    rpc.clear();
    await p1.catch(() => {});
    const p2 = rpc.pending('a', 'y');
    rpc.resolve('a', 99);
    expect(await p2).toBe(99);
  });

  it('returns this for chaining', () => {
    const rpc = new StatefulRpc<number, string>();
    expect(rpc.clear()).toBe(rpc);
  });
});

// ============================================================================
// Timeout
// ============================================================================

describe('StatefulRpc - timeout', () => {
  it('rejects with TimeoutError after the configured delay', async () => {
    const rpc = new StatefulRpc<number, string>({ timeout: 20 });
    const p = rpc.pending('r', 'd');
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries the ms value', async () => {
    const rpc = new StatefulRpc<number, string>({ timeout: 20 });
    const p = rpc.pending('r', 'd');
    const err = await p.catch((e) => e);
    expect((err as TimeoutError).ms).toBe(20);
  });

  it('default timeout is 30 seconds', () => {
    expect(new StatefulRpc().timeout).toBe(30 * 1000);
  });

  it('per-task timeout overrides the instance default', async () => {
    const rpc = new StatefulRpc<number, string>({ timeout: 1000 });
    const p = rpc.pending('r', 'd', 20); // 20ms per-task, not 1000ms
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).ms).toBe(20);
  });

  it('resolve before timeout prevents TimeoutError', async () => {
    let timedOut = false;
    const rpc = new StatefulRpc<number, string>({
      timeout: 100,
      events: {
        reject: () => {
          timedOut = true;
        },
      },
    });
    const p = rpc.pending('r', 'd');
    rpc.resolve('r', 42);
    expect(await p).toBe(42);
    await Bun.sleep(120);
    expect(timedOut).toBe(false);
  });

  it('timed-out task is removed from pendings', async () => {
    const rpc = new StatefulRpc<number, string>({ timeout: 20 });
    const p = rpc.pending('r', 'd');
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    expect(rpc.getPendingCount()).toBe(0);
  });

  it('first task timeout settles the whole group', async () => {
    const rpc = new StatefulRpc<number, string>({ timeout: 50 });
    const p1 = rpc.pending('k', 'first');
    await Bun.sleep(30); // p1 has 20ms left; p2 is added fresh
    const p2 = rpc.pending('k', 'second');

    // p1 times out → settle(key) rejects ALL tasks for 'k'.
    // p2 is rejected as collateral — it never timed out on its own.
    // Use .catch((e) => e) to attach synchronous handlers before the timer fires.
    const [e1, e2] = await Promise.all([
      p1.catch((e) => e),
      p2.catch((e) => e),
    ]);
    expect(e1).toBeInstanceOf(TimeoutError);
    expect(e2).toBeInstanceOf(TimeoutError);
    expect(rpc.getPendingCount('k')).toBe(0);
  });

  it('abort clears the timer — no late TimeoutError', async () => {
    let timedOut = false;
    const rpc = new StatefulRpc<number, string>({
      timeout: 30,
      events: {
        reject: (ev) => {
          if (ev.result instanceof TimeoutError) timedOut = true;
        },
      },
    });
    const p = rpc.pending('r', 'd');
    rpc.abort('r');
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(RpcAbortError);
    await Bun.sleep(50);
    expect(timedOut).toBe(false);
  });
});

// ============================================================================
// Events
// ============================================================================

describe('StatefulRpc - events', () => {
  it('pending event fires when a task is added', async () => {
    const keys: string[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { pending: ({ task }) => void keys.push(task.key) },
    });
    const p = rpc.pending('r', 'd');
    rpc.resolve('r', 1);
    await p;
    expect(keys).toEqual(['r']);
  });

  it('resolve event fires with task and result', async () => {
    const calls: { key: string; result: number }[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: {
        resolve: ({ task, result }) =>
          void calls.push({ key: task.key, result }),
      },
    });
    const p = rpc.pending('r', 'd');
    rpc.resolve('r', 42);
    await p;
    expect(calls).toEqual([{ key: 'r', result: 42 }]);
  });

  it('reject event fires for explicit reject', async () => {
    const errors: unknown[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { reject: ({ result }) => void errors.push(result) },
    });
    const err = new Error('fail');
    const p = rpc.pending('r', 'd');
    rpc.reject('r', err);
    await p.catch(() => {});
    expect(errors).toEqual([err]);
  });

  it('reject event fires for abort', async () => {
    const errors: unknown[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { reject: ({ result }) => void errors.push(result) },
    });
    const p = rpc.pending('r', 'd');
    rpc.abort('r', 'gone');
    await p.catch(() => {});
    expect(errors[0]).toBeInstanceOf(RpcAbortError);
  });

  it('reject event fires for timeout', async () => {
    const errors: unknown[] = [];
    const rpc = new StatefulRpc<number, string>({
      timeout: 20,
      events: { reject: ({ result }) => void errors.push(result) },
    });
    const p = rpc.pending('r', 'd');
    await p.catch(() => {});
    expect(errors[0]).toBeInstanceOf(TimeoutError);
  });

  it('reject event fires for each task on clear', async () => {
    const rejectedKeys: string[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { reject: ({ task }) => void rejectedKeys.push(task.key) },
    });
    const p1 = rpc.pending('a', 'x');
    const p2 = rpc.pending('b', 'y');
    rpc.clear();
    await Promise.all([p1, p2].map((p) => p.catch(() => {})));
    expect(rejectedKeys.sort()).toEqual(['a', 'b']);
  });

  it('settle event fires for both resolve and reject', async () => {
    const types: string[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { settle: ({ type }) => void types.push(type) },
    });
    const p1 = rpc.pending('a', 'x');
    const p2 = rpc.pending('b', 'y');
    rpc.resolve('a', 1);
    rpc.reject('b', new Error());
    await p1;
    await p2.catch(() => {});
    expect(types).toEqual(['resolve', 'reject']);
  });

  it('settle event fires once per task when multiple tasks share a key', async () => {
    const settled: string[] = [];
    const rpc = new StatefulRpc<number, string>({
      events: { settle: ({ task }) => void settled.push(task.taskId) },
    });
    const p1 = rpc.pending('k', 'a');
    const p2 = rpc.pending('k', 'b');
    rpc.resolve('k', 1);
    await Promise.all([p1, p2]);
    expect(settled).toHaveLength(2);
    expect(new Set(settled).size).toBe(2);
  });
});

// ============================================================================
// Constructor options
// ============================================================================

describe('StatefulRpc - constructor', () => {
  it('no-arg constructor uses defaults', () => {
    const rpc = new StatefulRpc();
    expect(rpc.timeout).toBe(30 * 1000);
    expect(rpc.id).toMatch(/^stateful-rpc-\d+$/);
  });

  it('idPrefix is reflected in id', () => {
    const rpc = new StatefulRpc({ idPrefix: 'ws' });
    expect(rpc.id).toMatch(/^ws-\d+$/);
  });

  it('custom timeout is applied', () => {
    const rpc = new StatefulRpc({ timeout: 5000 });
    expect(rpc.timeout).toBe(5000);
  });

  it('invalid timeout (0 or negative) falls back to 30s', () => {
    expect(new StatefulRpc({ timeout: 0 }).timeout).toBe(30 * 1000);
    expect(new StatefulRpc({ timeout: -1 }).timeout).toBe(30 * 1000);
  });
});
