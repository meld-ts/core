import { describe, expect, test } from 'bun:test';
import {
  createDelegator,
  createEmitter,
  initEventsEmitter,
  isEventsDelegator,
  isEventsEmitter,
  linkEvents,
  once,
} from './index';

// ── createEmitter ────────────────────────────────────────

describe('createEmitter', () => {
  describe('on / emit / off', () => {
    test('on registers listener, emit invokes it', async () => {
      const emitter = createEmitter<{ ping: string }>();
      let received = '';
      emitter.on('ping', (msg) => {
        received = msg;
      });
      await emitter.emit('ping', 'hello');
      expect(received).toBe('hello');
    });

    test('emit with no listeners does nothing', async () => {
      const emitter = createEmitter<{ ping: string }>();
      await expect(emitter.emit('ping', 'hello')).resolves.toBeUndefined();
    });

    test('off removes listener', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let count = 0;
      const cb = () => {
        count++;
      };
      emitter.on('tick', cb);
      emitter.off('tick', cb);
      await emitter.emit('tick', undefined as undefined);
      expect(count).toBe(0);
    });

    test('on returns unsubscribe function', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let count = 0;
      const off = emitter.on('tick', () => {
        count++;
      });
      off();
      await emitter.emit('tick', undefined as undefined);
      expect(count).toBe(0);
    });

    test('multiple listeners are all invoked', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let a = 0;
      let b = 0;
      emitter.on('tick', () => {
        a++;
      });
      emitter.on('tick', () => {
        b++;
      });
      await emitter.emit('tick', undefined as undefined);
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    test('emit should not the error', async () => {
      const errors: unknown[] = [];
      const emitter = createEmitter<{ boom: undefined }>({
        onError: (err) => errors.push(err),
      });
      emitter.on('boom', () => {
        throw new Error('e1');
      });
      emitter.on('boom', () => {
        throw new Error('e2');
      });
      expect(() => emitter.emit('boom', undefined)).not.toThrow(Error);
      expect(errors.length).toBe(2);
      // expect(emitter.emit('boom', undefined)).rejects.toThrow(Error);
    });
  });

  describe('once', () => {
    test('fires only once', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let count = 0;
      emitter.on(
        'tick',
        () => {
          count++;
        },
        true,
      );
      await emitter.emit('tick', undefined as undefined);
      await emitter.emit('tick', undefined as undefined);
      expect(count).toBe(1);
    });

    test('returns unsubscribe function that prevents firing', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let count = 0;
      const off = emitter.on(
        'tick',
        () => {
          count++;
        },
        true,
      );
      off();
      await emitter.emit('tick', undefined as undefined);
      expect(count).toBe(0);
    });

    test('still fires only once even if callback throws', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let calls = 0;
      emitter.on(
        'tick',
        () => {
          calls++;
          throw new Error('boom');
        },
        true,
      );
      await emitter.emit('tick', undefined as undefined).catch(() => {});
      await emitter.emit('tick', undefined as undefined).catch(() => {});
      expect(calls).toBe(1);
    });

    test('once and on listeners coexist', async () => {
      const emitter = createEmitter<{ tick: undefined }>();
      let onCount = 0;
      let onceCount = 0;
      emitter.on('tick', () => {
        onCount++;
      });
      emitter.on(
        'tick',
        () => {
          onceCount++;
        },
        true,
      );
      await emitter.emit('tick', undefined as undefined);
      await emitter.emit('tick', undefined as undefined);
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
      ping: (msg: string) => {
        received = msg;
      },
    });
    delegator.inject(emitter);
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('eject unbinds all callbacks', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => {
        count++;
      },
    });
    delegator.inject(emitter);
    delegator.eject();
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(0);
  });

  test('inject twice clears old bindings', async () => {
    const e1 = createEmitter<{ tick: undefined }>();
    const e2 = createEmitter<{ tick: undefined }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => {
        count++;
      },
    });
    delegator.inject(e1);
    delegator.inject(e2);
    await e1.emit('tick', undefined as undefined);
    expect(count).toBe(0); // old emitter cleared
    await e2.emit('tick', undefined as undefined);
    expect(count).toBe(1);
  });

  test('inject with null does nothing', () => {
    const delegator = createDelegator({ tick: () => {} });
    expect(() => delegator.inject(undefined)).not.toThrow();
  });

  test('multiple callbacks in array declaration', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let a = 0;
    let b = 0;
    const delegator = createDelegator({
      tick: [
        () => {
          a++;
        },
        () => {
          b++;
        },
      ],
    });
    delegator.inject(emitter);
    await emitter.emit('tick', undefined as undefined);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test('once()-marked callbacks fire only once in delegator', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let onCount = 0;
    let onceCount = 0;
    const delegator = createDelegator({
      tick: [
        () => {
          onCount++;
        },
        once(() => {
          onceCount++;
        }),
      ],
    });
    delegator.inject(emitter);
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(onCount).toBe(2);
    expect(onceCount).toBe(1);
  });

  test('once()-marked single callback in delegator', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    const delegator = createDelegator({
      tick: once(() => {
        count++;
      }),
    });
    delegator.inject(emitter);
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(1);
  });
});

// ── linkEvents ───────────────────────────────────────────

describe('linkEvents', () => {
  test('links callbacks object to emitter', async () => {
    const emitter = createEmitter<{ ping: string }>();
    let received = '';
    linkEvents(emitter, {
      ping: (msg: string) => {
        received = msg;
      },
    });
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('unlinks callbacks with mode=off', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    const cb = () => {
      count++;
    };
    linkEvents(emitter, { tick: cb });
    linkEvents(emitter, { tick: cb }, 'off');
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(0);
  });

  test('links delegator to emitter', async () => {
    const emitter = createEmitter<{ ping: string }>();
    let received = '';
    const delegator = createDelegator({
      ping: (msg: string) => {
        received = msg;
      },
    });
    linkEvents(emitter, delegator);
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('links callbacks with mode=once (fires only once)', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    linkEvents(
      emitter,
      {
        tick: () => {
          count++;
        },
      },
      'once',
    );
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(1);
  });

  test('links delegator with mode=once overrides once() marks', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    // once()-marked callback, but mode='once' should still force single fire
    const delegator = createDelegator({
      tick: once(() => {
        count++;
      }),
    });
    linkEvents(emitter, delegator, 'once');
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(1);
  });

  test('unlinks delegator with mode=off', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    const delegator = createDelegator({
      tick: () => {
        count++;
      },
    });
    linkEvents(emitter, delegator);
    linkEvents(emitter, delegator, 'off');
    await emitter.emit('tick', undefined as undefined);
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
      ping: (msg: string) => {
        received = msg;
      },
    });
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });

  test('delegator input creates emitter and injects it', async () => {
    let received = '';
    const delegator = createDelegator<{ ping: string }>({
      ping: (msg: string) => {
        received = msg;
      },
    });
    const emitter = initEventsEmitter(delegator);
    await emitter.emit('ping', 'hello');
    expect(received).toBe('hello');
  });
});
