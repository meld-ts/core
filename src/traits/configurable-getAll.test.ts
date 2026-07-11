import { describe, expect, test } from 'bun:test';
import { configurable } from './configurable';

describe('configurable — getAll deep copy isolation', () => {
  test('getAll() nested object mutation does not pollute internal presets', () => {
    const cfg = configurable({
      nested: { value: 1 },
      list: [1, 2, 3],
    });

    const all = cfg.getAll();
    all.nested.value = 999;
    all.list.push(4);

    // internal state should be unaffected
    expect(cfg.get('nested')).toEqual({ value: 1 });
    expect(cfg.get('list')).toEqual([1, 2, 3]);
  });

  test('getAll() after set() — nested user value mutation does not pollute internal state', () => {
    const cfg = configurable<{ nested: { value: number } }>({
      nested: { value: 1 },
    });

    cfg.set('nested', { value: 42 });
    const all = cfg.getAll();
    all.nested.value = 999;

    // get() should return the unmodified user value
    expect(cfg.get('nested')).toEqual({ value: 42 });
  });

  test('getAll() deep isolation survives reset()', () => {
    const cfg = configurable<{ nested: { value: number } }>({
      nested: { value: 1 },
    });

    const all = cfg.getAll();
    all.nested.value = 999;

    cfg.reset();
    expect(cfg.get('nested')).toEqual({ value: 1 });
  });
});
