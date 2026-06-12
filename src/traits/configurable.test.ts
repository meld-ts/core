import { describe, expect, test } from 'bun:test';
import { configurable } from './configurable';

const makePresets = () => ({
  timeout: 3000,
  retries: 3,
  debug: false,
  label: 'default',
});

describe('configurable', () => {
  describe('get', () => {
    test('returns preset value when user has not set anything', () => {
      const cfg = configurable(makePresets());
      expect(cfg.get('timeout')).toBe(3000);
      expect(cfg.get('retries')).toBe(3);
      expect(cfg.get('debug')).toBe(false);
    });

    test('returns user value after set()', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 9000);
      expect(cfg.get('timeout')).toBe(9000);
    });

    test('user value takes priority over preset', () => {
      const cfg = configurable(makePresets());
      cfg.set('debug', true);
      expect(cfg.get('debug')).toBe(true);
    });

    test('user null value is respected (not falling through to preset)', () => {
      const cfg = configurable<{ label: string | null }>({ label: 'default' });
      cfg.set('label', null);
      expect(cfg.get('label')).toBeNull();
    });
  });

  describe('set', () => {
    test('only affects the specified key', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 1000);
      expect(cfg.get('retries')).toBe(3);
      expect(cfg.get('debug')).toBe(false);
    });

    test('overwrite with multiple set() calls', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 1000);
      cfg.set('timeout', 5000);
      expect(cfg.get('timeout')).toBe(5000);
    });
  });

  describe('getAll', () => {
    test('returns presets when no user values set', () => {
      const cfg = configurable(makePresets());
      expect(cfg.getAll()).toEqual(makePresets());
    });

    test('merges user values over presets', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 9000);
      cfg.set('debug', true);
      expect(cfg.getAll()).toEqual({
        timeout: 9000,
        retries: 3,
        debug: true,
        label: 'default',
      });
    });

    test('returns a new object (not the internal state)', () => {
      const cfg = configurable(makePresets());
      const all = cfg.getAll();
      all.timeout = 99999;
      expect(cfg.get('timeout')).toBe(3000);
    });
  });

  describe('setAll', () => {
    test('sets multiple keys at once', () => {
      const cfg = configurable(makePresets());
      cfg.setAll({ timeout: 500, debug: true });
      expect(cfg.get('timeout')).toBe(500);
      expect(cfg.get('debug')).toBe(true);
      expect(cfg.get('retries')).toBe(3); // unaffected
    });

    test('merges with existing user values', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 100);
      cfg.setAll({ debug: true });
      expect(cfg.get('timeout')).toBe(100);
      expect(cfg.get('debug')).toBe(true);
    });
  });

  describe('reset', () => {
    test('clears all user values', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 9000);
      cfg.set('debug', true);
      cfg.reset();
      expect(cfg.get('timeout')).toBe(3000);
      expect(cfg.get('debug')).toBe(false);
    });

    test('getAll returns presets after reset', () => {
      const cfg = configurable(makePresets());
      cfg.setAll({ timeout: 1, retries: 1, debug: true, label: 'x' });
      cfg.reset();
      expect(cfg.getAll()).toEqual(makePresets());
    });
  });

  describe('has', () => {
    test('returns true for keys with preset defaults', () => {
      const cfg = configurable(makePresets());
      expect(cfg.has('timeout')).toBe(true);
      expect(cfg.has('retries')).toBe(true);
    });

    test('returns true after set() (still exists)', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 9000);
      expect(cfg.has('timeout')).toBe(true);
    });

    test('returns true even when value is undefined', () => {
      const cfg = configurable<{ label?: string }>({ label: 'default' });
      cfg.set('label', undefined);
      expect(cfg.has('label')).toBe(true);
    });

    test('returns true after setAll (existing + new keys)', () => {
      const cfg = configurable(makePresets());
      cfg.setAll({ timeout: 500 });
      expect(cfg.has('timeout')).toBe(true);
      expect(cfg.has('retries')).toBe(true); // preset key
    });

    test('returns true after reset (presets remain)', () => {
      const cfg = configurable(makePresets());
      cfg.set('timeout', 100);
      cfg.reset();
      expect(cfg.has('timeout')).toBe(true); // exists in presets
    });

    test('returns false for keys not in presets and never set', () => {
      const cfg = configurable<{ a?: number }>({});
      expect(cfg.has('a')).toBe(false);
    });

    test('"toString" is not falsely reported', () => {
      const cfg = configurable(makePresets());
      expect(cfg.has('toString' as keyof ReturnType<typeof makePresets>)).toBe(
        false,
      );
    });
  });

  describe('preset isolation', () => {
    test('mutating original presets object does not affect configurable', () => {
      const presets = makePresets();
      const cfg = configurable(presets);
      presets.timeout = 99999;
      expect(cfg.get('timeout')).toBe(3000);
    });

    test('two instances with same presets are independent', () => {
      const cfg1 = configurable(makePresets());
      const cfg2 = configurable(makePresets());
      cfg1.set('timeout', 1);
      expect(cfg2.get('timeout')).toBe(3000);
    });
  });
});
