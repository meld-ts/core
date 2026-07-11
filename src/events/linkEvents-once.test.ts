import { describe, expect, test } from 'bun:test';
import { createDelegator, createEmitter, linkEvents } from './index';

describe('linkEvents — mode=once with delegator', () => {
  test('non-once callbacks in delegator fire only once when mode=once', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    const delegator = createDelegator<{ tick: undefined }>({
      tick: () => {
        count++;
      },
    });
    linkEvents(emitter, delegator, 'once');
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(1);
  });

  test('mixed once() and non-once callbacks in delegator all fire once when mode=once', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let normalCount = 0;
    let alreadyOnceCount = 0;
    const delegator = createDelegator<{ tick: undefined }>({
      tick: [
        () => {
          normalCount++;
        },
        () => {
          alreadyOnceCount++;
        },
      ],
    });
    linkEvents(emitter, delegator, 'once');
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(normalCount).toBe(1);
    expect(alreadyOnceCount).toBe(1);
  });

  test('mode=on with delegator — non-once callbacks fire on every emit (regression)', async () => {
    const emitter = createEmitter<{ tick: undefined }>();
    let count = 0;
    const delegator = createDelegator<{ tick: undefined }>({
      tick: () => {
        count++;
      },
    });
    linkEvents(emitter, delegator, 'on');
    await emitter.emit('tick', undefined as undefined);
    await emitter.emit('tick', undefined as undefined);
    expect(count).toBe(2);
  });
});
