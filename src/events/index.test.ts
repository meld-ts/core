import { describe, expect, test } from 'bun:test';
import {
  createDelegator,
  createEmitter,
  initEventsEmitter,
  isEventsDelegator,
  isEventsEmitter,
  linkEvents,
} from './index';

// ── createEmitter ────────────────────────────────────────

describe('createEmitter', () => {
  describe('on / emit / off', () => {
    test('on registers listener, emit invokes it', async () => {
      const emitter = createEmitter<{ ping: string }>();
      let received = '';
      emitter.on('ping', (msg) => { received = msg; });
      await emitter.emit('ping', 'hello');
      expect(received).toBe('hello');
    });

    test('emit with no listeners does nothing', async () => {
      const emitter = createEmitter<{ ping: string }>();
      await expect(emitter.emit('ping', 'hello')).resolves.toBeUndefined();
    });

    test('off removes listener', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let count = 0;
      const cb = () => { count++; };
      emitter.on('tick', cb);
      emitter.off('tick', cb);
      await emitter.emit('tick', undefined as void);
      expect(count).toBe(0);
    });

    test('on returns unsubscribe function', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let count = 0;
      const off = emitter.on('tick', () => { count++; });
      off();
      await emitter.emit('tick', undefined as void);
      expect(count).toBe(0);
    });

    test('multiple listeners are all invoked', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let a = 0;
      let b = 0;
      emitter.on('tick', () => { a++; });
      emitter.on('tick', () => { b++; });
      await emitter.emit('tick', undefined as void);
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    test('emit collects errors into AggregateError', async () => {
      const emitter = createEmitter<{ boom: void }>();
      emitter.on('boom', () => { throw new Error('e1'); });
      emitter.on('boom', () => { throw new Error('e2'); });
      await expect(emitter.emit('boom', undefined as void)).rejects.toThrow(
        AggregateError,
      );
    });
  });

  describe('once', () => {
    test('fires only once', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let count = 0;
      emitter.once('tick', () => { count++; });
      await emitter.emit('tick', undefined as void);
      await emitter.emit('tick', undefined as void);
      expect(count).toBe(1);
    });

    test('returns unsubscribe function that prevents firing', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let count = 0;
      const off = emitter.once('tick', () => { count++; });
      off();
      await emitter.emit('tick', undefined as void);
      expect(count).toBe(0);
    });

    test('still fires only once even if callback throws', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let calls = 0;
      emitter.once('tick', () => {
        calls++;
        throw new Error('boom');
      });
      await emitter.emit('tick', undefined as void).catch(() => {});
      await emitter.emit('tick', undefined as void).catch(() => {});
      expect(calls).toBe(1);
    });

    test('once and on listeners coexist', async () => {
      const emitter = createEmitter<{ tick: void }>();
      let onCount = 0;
      let onceCount = 0;
      emitter.on('tick', () => { onCount++; });
      emitter.once('tick', () => { onceCount++; });
      await emitter.emit('tick', undefined as void);
      await emitter.emit('tick', undefined as void);
      expect(onCount).toBe(2);
      expect(onceCount).toBe(1);
    });
  });
});

// ── isEventsEmitter / isEventsDelegator ──────────────────

describe('type guards', () => {
  test('isEventsEmitter recognizes emitter', () => {
    expect(isEventsEmitter(createEmitter())).toBe(true);
  });

  test('isEventsEmitter rejects plain object', () => {
    expect(isEventsEmitter({ emit: 123 })).toBe(false);
    expect(isEventsEmitter(null)).toBe(false);
    expect(isEventsEmitter({})).toBe(false);
  });

  test('isEventsDelegator recognizes delegator', () => {
    const d = createDelegator({});
    expect(isEventsDelegator(d)).toBe(true);
  });

  test('isEventsDelegator rejects plain object', () => {
    expect(isEventsDelegator({ inject: () => {} })).toBe(false);
    expect(isEventsDelegator(null)).toBe(false);
  });
});

// ── createDelegator ──────────────────────────────────────

describe('createDelegator', () => {
  test('inject binds callbacks to emitter', async () => {
    const emitter = createEmitter<{ ping: string }>();
    let received = '';
    const delegator = createDelegator({
      ping: (msg: string) => { received = msg; },
    });
    delegator.inject(emitter);
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('eject unbinds all callbacks', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => { count++; },
    });
    delegator.inject(emitter);
    delegator.eject();
    await emitter.emit('tick', undefined as void);
    expect(count).toBe(0);
  });

  test('inject twice clears old bindings', async () => {
    const e1 = createEmitter<{ tick: void }>();
    const e2 = createEmitter<{ tick: void }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => { count++; },
    });
    delegator.inject(e1);
    delegator.inject(e2);
    await e1.emit('tick', undefined as void);
    expect(count).toBe(0); // old emitter cleared
    await e2.emit('tick', undefined as void);
    expect(count).toBe(1);
  });

  test('inject with null does nothing', () => {
    const delegator = createDelegator({ tick: () => {} });
    expect(() => delegator.inject(undefined)).not.toThrow();
  });

  test('multiple callbacks in array declaration', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let a = 0;
    let b = 0;
    const delegator = createDelegator({
      tick: [() => { a++; }, () => { b++; }],
    });
    delegator.inject(emitter);
    await emitter.emit('tick', undefined as void);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test('inject with isOnce=true registers all callbacks as once', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => { count++; },
    });
    delegator.inject(emitter, true);
    await emitter.emit('tick', undefined as void);
    await emitter.emit('tick', undefined as void);
    expect(count).toBe(1);
  });
});

// ── linkEvents ───────────────────────────────────────────

describe('linkEvents', () => {
  test('links callbacks object to emitter', async () => {
    const emitter = createEmitter<{ ping: string }>();
    let received = '';
    linkEvents(emitter, {
      ping: (msg: string) => { received = msg; },
    });
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('unlinks callbacks with mode=off', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let count = 0;
    const cb = () => { count++; };
    linkEvents(emitter, { tick: cb });
    linkEvents(emitter, { tick: cb }, 'off');
    await emitter.emit('tick', undefined as void);
    expect(count).toBe(0);
  });

  test('links delegator to emitter', async () => {
    const emitter = createEmitter<{ ping: string }>();
    let received = '';
    const delegator = createDelegator({
      ping: (msg: string) => { received = msg; },
    });
    linkEvents(emitter, delegator);
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('links callbacks with mode=once (fires only once)', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let count = 0;
    linkEvents(emitter, { tick: () => { count++; } }, 'once');
    await emitter.emit('tick', undefined as void);
    await emitter.emit('tick', undefined as void);
    expect(count).toBe(1);
  });

  test('links delegator with mode=once', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => { count++; },
    });
    linkEvents(emitter, delegator, 'once');
    await emitter.emit('tick', undefined as void);
    await emitter.emit('tick', undefined as void);
    expect(count).toBe(1);
  });

  test('unlinks delegator with mode=off', async () => {
    const emitter = createEmitter<{ tick: void }>();
    let count = 0;
    const delegator = createDelegator({ tick: () => { count++; } });
    linkEvents(emitter, delegator);
    linkEvents(emitter, delegator, 'off');
    await emitter.emit('tick', undefined as void);
    expect(count).toBe(0);
  });

  test('returns emitter for chaining', () => {
    const emitter = createEmitter();
    const result = linkEvents(emitter, {});
    expect(result).toBe(emitter);
  });
});

// ── initEventsEmitter ────────────────────────────────────

describe('initEventsEmitter', () => {
  test('null/undefined input creates new emitter', () => {
    const e = initEventsEmitter(null);
    expect(isEventsEmitter(e)).toBe(true);
  });

  test('existing emitter is returned as-is', () => {
    const original = createEmitter();
    const result = initEventsEmitter(original);
    expect(result).toBe(original);
  });

  test('callbacks input creates emitter and links them', async () => {
    let received = '';
    const emitter = initEventsEmitter<{ ping: string }>({
      ping: (msg: string) => { received = msg; },
    });
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('delegator input creates emitter and injects it', async () => {
    let received = '';
    const delegator = createDelegator<{ ping: string }>({
      ping: (msg: string) => { received = msg; },
    });
    const emitter = initEventsEmitter(delegator);
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });
});
