import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import {
  type DebugSettings,
  type DebuggableTrait,
  createDebuggableTrait,
  debugTimeFlag,
} from './debuggable';
import { implTraits } from './implTraits';

// ── debugTimeFlag ─────────────────────────────────────────────────────────────

describe('debugTimeFlag', () => {
  it('formats a given date as HH:MM:SS.mmm', () => {
    const d = new Date(2024, 0, 1, 9, 5, 3, 7);
    expect(debugTimeFlag(d)).toBe('09:05:03.007');
  });

  it('pads single-digit fields with leading zeros', () => {
    const d = new Date(2024, 0, 1, 0, 0, 0, 0);
    expect(debugTimeFlag(d)).toBe('00:00:00.000');
  });

  it('uses current time when called with no args', () => {
    const result = debugTimeFlag();
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('null arg behaves the same as no arg', () => {
    const result = debugTimeFlag(null);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});

// ── setDebug ──────────────────────────────────────────────────────────────────

describe('setDebug', () => {
  type Settings = DebugSettings & { fetch?: boolean; ws?: boolean };

  let obj: DebuggableTrait<Settings>;

  beforeEach(() => {
    obj = createDebuggableTrait<Settings>({ name: 'Test' });
  });

  it('setDebug(true) sets debug: true', () => {
    obj.setDebug(true);
    expect(obj.debugSettings?.debug).toBe(true);
  });

  it('setDebug(false) sets debug: false', () => {
    obj.setDebug(false);
    expect(obj.debugSettings?.debug).toBe(false);
  });

  it('setDebug with object merges into debugSettings', () => {
    obj.setDebug({ debug: true, fetch: true });
    expect(obj.debugSettings?.debug).toBe(true);
    expect(obj.debugSettings?.fetch).toBe(true);
  });

  it('merges with existing settings, does not overwrite all', () => {
    obj.setDebug({ debug: true, fetch: true });
    obj.setDebug({ ws: false });
    expect(obj.debugSettings?.debug).toBe(true); // preserved
    expect(obj.debugSettings?.fetch).toBe(true); // preserved
    expect(obj.debugSettings?.ws).toBe(false); // new
  });

  it('setDebug() with no arg is a no-op', () => {
    obj.setDebug();
    expect(obj.debugSettings).toBeUndefined();
  });

  it('returns this for chaining', () => {
    expect(obj.setDebug(true)).toBe(obj);
  });
});

// ── shouldDebug ───────────────────────────────────────────────────────────────

describe('shouldDebug', () => {
  type Settings = DebugSettings & { fetch?: boolean; ws?: boolean };

  let obj: DebuggableTrait<Settings>;

  beforeEach(() => {
    obj = createDebuggableTrait<Settings>({ name: 'Test' });
  });

  it('returns false when no settings set', () => {
    expect(obj.shouldDebug()).toBe(false);
  });

  it('returns false when debug: false', () => {
    obj.setDebug(false);
    expect(obj.shouldDebug()).toBe(false);
  });

  it('returns true when debug: true and no scope', () => {
    obj.setDebug(true);
    expect(obj.shouldDebug()).toBe(true);
  });

  it('null scope falls back to debug flag', () => {
    obj.setDebug(true);
    expect(obj.shouldDebug(null)).toBe(true);
  });

  it('undefined scope falls back to debug flag', () => {
    obj.setDebug(true);
    expect(obj.shouldDebug(undefined)).toBe(true);
  });

  it('scope-level true overrides global debug: false', () => {
    obj.setDebug({ debug: false, fetch: true });
    expect(obj.shouldDebug('fetch')).toBe(true);
  });

  it('scope-level false overrides global debug: true', () => {
    obj.setDebug({ debug: true, fetch: false });
    expect(obj.shouldDebug('fetch')).toBe(false);
  });

  it('unknown scope inherits global debug flag', () => {
    obj.setDebug(true);
    expect(obj.shouldDebug('ws')).toBe(true);
  });

  describe('dotted scope resolution', () => {
    it('dotted scope matches exact key first', () => {
      obj.setDebug({ debug: false, 'fetch.request': true } as Settings);
      expect(obj.shouldDebug('fetch.request')).toBe(true);
    });

    it('dotted scope falls back to namespace when exact key absent', () => {
      obj.setDebug({ debug: false, fetch: true } as Settings);
      expect(obj.shouldDebug('fetch.request')).toBe(true); // inherits from fetch
    });

    it('exact dotted key takes priority over namespace', () => {
      obj.setDebug({
        debug: true,
        fetch: true,
        'fetch.request': false,
      } as Settings);
      expect(obj.shouldDebug('fetch.request')).toBe(false);
    });

    it('dotted scope falls back to global when neither key nor ns found', () => {
      obj.setDebug({ debug: true } as Settings);
      expect(obj.shouldDebug('ws.connect')).toBe(true);
    });

    it('dotted scope with namespace false and no exact key → false', () => {
      obj.setDebug({ debug: true, fetch: false } as Settings);
      expect(obj.shouldDebug('fetch.request')).toBe(false);
    });
  });
});

// ── debug output ──────────────────────────────────────────────────────────────

describe('debug output', () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('does not call console.log when shouldDebug is false', () => {
    const obj = createDebuggableTrait({ name: 'App' });
    obj.debug('fetch', 'hello');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('calls console.log with args when debug is on', () => {
    const obj = createDebuggableTrait({ name: 'App' });
    obj.setDebug(true);
    obj.debug(null, 'hello', 42);
    expect(logSpy).toHaveBeenCalled();
    const args = logSpy.mock.calls[0] as unknown[];
    expect(args).toContain('hello');
    expect(args).toContain(42);
  });

  it('includes name in output when name is set', () => {
    const obj = createDebuggableTrait({ name: 'MyApp' });
    obj.setDebug(true);
    obj.debug(null, 'data');
    const head = logSpy.mock.calls[0][0] as string;
    expect(head).toContain('MyApp');
  });

  it('includes scope in output', () => {
    const obj = createDebuggableTrait({ name: 'App' });
    obj.setDebug(true);
    obj.debug('fetch', 'payload');
    const head = logSpy.mock.calls[0][0] as string;
    expect(head).toContain('fetch');
  });

  it('includes %c prefix when color is set', () => {
    const obj = createDebuggableTrait({ name: 'App', color: 'blue' });
    obj.setDebug(true);
    obj.debug(null);
    const args = logSpy.mock.calls[0] as string[];
    expect(args[0]).toContain('%cApp');
    expect(args[1]).toBe('color: blue');
  });

  it('style takes priority over color', () => {
    const obj = createDebuggableTrait({
      name: 'App',
      color: 'blue',
      style: 'color: red; font-weight: bold',
    });
    obj.setDebug(true);
    obj.debug(null);
    const args = logSpy.mock.calls[0] as string[];
    expect(args[1]).toBe('color: red; font-weight: bold');
  });

  it('includes timestamp when timeFlag: true', () => {
    const obj = createDebuggableTrait({ name: 'App', timeFlag: true });
    obj.setDebug(true);
    obj.debug(null);
    const head = logSpy.mock.calls[0][0] as string;
    expect(head).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it('omits timestamp when timeFlag is not set', () => {
    const obj = createDebuggableTrait({ name: 'App' });
    obj.setDebug(true);
    obj.debug(null);
    const head = logSpy.mock.calls[0][0] as string;
    expect(head).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('timeFlag as function uses returned string', () => {
    const obj = createDebuggableTrait({ name: 'App', timeFlag: () => 'T=0' });
    obj.setDebug(true);
    obj.debug(null);
    const head = logSpy.mock.calls[0][0] as string;
    expect(head).toContain('T=0');
  });

  it('uses console.debug when method: "debug"', () => {
    const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});
    const obj = createDebuggableTrait({ name: 'App', method: 'debug' });
    obj.setDebug(true);
    obj.debug(null, 'msg');
    expect(debugSpy).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('uses custom function when method is a function', () => {
    const calls: unknown[][] = [];
    const obj = createDebuggableTrait({
      name: 'App',
      method: (...args) => calls.push(args),
    });
    obj.setDebug(true);
    obj.debug(null, 'x', 'y');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('x');
    expect(calls[0]).toContain('y');
  });

  it('custom format function receives vars and styles', () => {
    let capturedVars: Record<string, string | null | undefined> | undefined;
    const obj = createDebuggableTrait({
      name: 'App',
      format: (vars, _styles) => {
        capturedVars = vars;
        return [`[${vars.name}]`];
      },
    });
    obj.setDebug(true);
    obj.debug('fetch', 'data');
    expect(capturedVars?.name).toBe('App');
    expect(capturedVars?.scope).toBe('fetch');
  });

  it('returns this for chaining', () => {
    const obj = createDebuggableTrait({ name: 'App' });
    obj.setDebug(true);
    expect(obj.debug(null)).toBe(obj);
  });
});

// ── getStack ──────────────────────────────────────────────────────────────────

describe('getStack', () => {
  it('returns a non-empty array', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const stack = obj.getStack();
    expect(Array.isArray(stack)).toBe(true);
    expect(stack.length).toBeGreaterThan(0);
  });

  it('all elements are non-empty trimmed strings', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const stack = obj.getStack();
    for (const line of stack) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
      expect(line).toBe(line.trim());
    }
  });

  it('first element is not the "Error" header line', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const stack = obj.getStack();
    for (const line of stack) {
      expect(line).not.toBe('Error');
    }
  });

  it('skipFrames=1 shifts the stack by one', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const s0 = obj.getStack(0);
    const s1 = obj.getStack(1);
    // 两次 new Error 调用点不同，栈尾可能相差一帧，只比前几帧内容
    expect(s1[0]).toBe(s0[1]);
    expect(s1[1]).toBe(s0[2]);
  });

  it('skipFrames=2 shifts by two', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const s0 = obj.getStack(0);
    const s2 = obj.getStack(2);
    expect(s2[0]).toBe(s0[2]);
  });

  it('negative skipFrames is clamped to 0', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const sNeg = obj.getStack(-5);
    const sZero = obj.getStack(0);
    // 负值 clamp 到 0，前几帧应完全一致
    for (let i = 0; i < Math.min(sNeg.length, 3); i++) {
      expect(sNeg[i]).toBe(sZero[i]);
    }
  });

  it('non-integer skipFrames is truncated toward zero', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const sFloat = obj.getStack(1.9);
    const sOne = obj.getStack(1);
    expect(sFloat[0]).toBe(sOne[0]);
    expect(sFloat[1]).toBe(sOne[1]);
  });

  it('stack frames contain function or file references', () => {
    const obj = createDebuggableTrait({ name: 'Test' });
    const stack = obj.getStack();
    const hasFrame = stack.some(
      (l) => l.startsWith('at ') || l.includes('@') || l.includes('http'),
    );
    expect(hasFrame).toBe(true);
  });
});

// ── integration: implTraits ───────────────────────────────────────────────────

type AppDebugSettings = DebugSettings & { http?: boolean; ws?: boolean };

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class AppService {
  name = 'app-service';
}

implTraits(
  AppService,
  createDebuggableTrait<AppDebugSettings>({ name: 'AppService' }),
);
// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface AppService extends DebuggableTrait<AppDebugSettings> {}

describe('implTraits integration', () => {
  it('trait methods are available on class instances', () => {
    const svc = new AppService();
    expect(typeof svc.setDebug).toBe('function');
    expect(typeof svc.shouldDebug).toBe('function');
    expect(typeof svc.debug).toBe('function');
    expect(typeof svc.getStack).toBe('function');
  });

  it('debugConfig is shared on prototype', () => {
    const a = new AppService();
    const b = new AppService();
    expect(a.debugConfig).toBeDefined();
    expect(b.debugConfig).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: toBeDefined() asserts above
    expect(a.debugConfig!).toBe(b.debugConfig!);
  });

  it('debugSettings is per-instance after setDebug', () => {
    const a = new AppService();
    const b = new AppService();
    a.setDebug(true);
    expect(a.debugSettings?.debug).toBe(true);
    expect(b.debugSettings).toBeUndefined();
  });

  it('setDebug on one instance does not affect another', () => {
    const a = new AppService();
    const b = new AppService();
    a.setDebug({ debug: true, http: true });
    b.setDebug({ debug: false });
    expect(a.shouldDebug()).toBe(true);
    expect(b.shouldDebug()).toBe(false);
  });

  it('child class inherits trait from parent via prototype chain', () => {
    class AdminService extends AppService {}
    const admin = new AdminService();
    admin.setDebug(true);
    expect(admin.shouldDebug()).toBe(true);
  });

  it('debugConfig.name reflects config passed to factory', () => {
    const svc = new AppService();
    expect(svc.debugConfig?.name).toBe('AppService');
  });
});