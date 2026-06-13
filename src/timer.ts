import { _typeFunc } from './_internal';
import { isInferObject, isString } from './guards';

export const _errTimerModeInvalid = 'Timer mode invalid';

/**
 * timer / ticker 实例的操作接口
 *
 * 由 {@link createTimer} 和 {@link createTicker} 返回。
 * 每个实例管理自己前缀下的定时器，互不干扰。
 */
export interface TimerHandle {
  /**
   * 注册（或覆盖）一个定时任务，返回清除函数。
   *
   * 同 key 重复调用会先清除上一个定时器再注册新的。
   */
  set(
    key: string,
    callback: () => void | Promise<void>,
    ms: number,
  ): () => void;

  /** 清除指定 key 的定时器 */
  clear(key: string): void;

  /** 清除此实例前缀下的所有定时器 */
  clearAll(): void;
}

export type TimerMode = 'timeout' | 'interval' | TimerCustomMode;

type SetTimer<Id = string> = (fn: () => void, ms: number) => Id;

export interface TimerCustomMode<Id = string> {
  set: SetTimer<Id>;
  clear: (id: Id) => void;
}

type TimerId<Mode extends TimerMode> =
  Mode extends TimerCustomMode<infer Id>
    ? Id
    : Mode extends 'timeout'
      ? ReturnType<typeof setTimeout>
      : Mode extends 'interval'
        ? ReturnType<typeof setInterval>
        : unknown;

export interface TimerOptions<Mode extends TimerMode = 'timeout'> {
  prefix?: string | null;
  mode?: Mode;
  onError?: (error: unknown, key: string) => void;

  [key: string]: unknown;
}

const _validateMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`ms must be a finite non-negative number, got ${ms}`);
  }
};

const isCustomMode = <Mode extends TimerMode>(mode: unknown) =>
  isInferObject<TimerCustomMode<TimerId<Mode>>>(
    mode,
    (it) => typeof it.set === _typeFunc && typeof it.clear === _typeFunc,
  );

const timeout: TimerCustomMode<TimerId<'timeout'>> = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
};

const interval: TimerCustomMode<TimerId<'interval'>> = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (id) => clearInterval(id),
};

const _selectModeImpl = <Mode extends TimerMode = 'timeout'>(
  mode: Mode = 'timeout' as Mode,
  // biome-ignore lint/suspicious/noExplicitAny: conditional type TimerId<Mode> cannot be narrowed in branches
): TimerCustomMode<any> => {
  if (mode == null || mode === 'timeout') return timeout;
  if (mode === 'interval') return interval;
  if (isCustomMode<Mode>(mode)) return mode;
  throw new Error(_errTimerModeInvalid);
};

/**
 * 创建带前缀的 timer 实例（setTimeout）
 *
 * 自动给 key 加前缀，避免不同模块间的 key 冲突。
 * `clearAll()` 只清自己前缀下的定时器，不影响其他实例。
 *
 * `set()` 返回一个清除函数，可直接用于组件卸载等场景，
 * 无需通过 `key` 查找。
 *
 * @param prefixOrOptions — key 前缀（字符串）或 timer 配置。
 * @param mode       — 模式，timeout/interval/自定义模式
 *
 * @example
 * ```ts
 * const t = createTimer('api');
 *
 * const stopPoll = t.set('poll', () => fetch('/status'), 5000);
 * stopPoll();            // 或 t.clear('poll')
 * t.clearAll();          // 只清 'api:*'
 * ```
 */
export const createTimer = <Mode extends TimerMode = 'timeout'>(
  prefixOrOptions?: string | TimerOptions<Mode> | null,
  mode: Mode = 'timeout' as Mode,
): TimerHandle => {
  const opts: TimerOptions<Mode> = isString(prefixOrOptions)
    ? { prefix: prefixOrOptions, mode: mode }
    : { ...prefixOrOptions, mode: mode || prefixOrOptions?.mode };
  const store: Record<string, TimerId<Mode>> = {};
  const impl = _selectModeImpl(opts.mode);

  const fullKey = (key: string) => {
    if (opts.prefix) return `${opts.prefix}:${key}`;
    return key;
  };

  const clear = (key: string) => {
    const k = fullKey(key);
    if (Object.hasOwn(store, k)) {
      impl.clear(store[k]);
      delete store[k];
    }
  };

  return {
    set(key, callback, ms) {
      _validateMs(ms);
      clear(key);
      const k = fullKey(key);
      store[k] = impl.set(() => {
        try {
          const result = callback();
          if (result instanceof Promise) {
            result.catch((err) => opts.onError?.(err, k));
          }
        } catch (err) {
          opts.onError?.(err, k);
        }
      }, ms);
      return () => clear(key);
    },

    clear,

    clearAll() {
      const keys = Object.keys(store);
      for (const key of keys) {
        impl.clear(store[key]);
        delete store[key];
      }
    },
  };
};

/**
 * 创建带前缀的 ticker 实例（setInterval）
 *
 * 与 `createTimer` 对称，使用 `setInterval`。
 * `set()` 同样返回清除函数。
 *
 * @param prefixOrOptions — key 前缀（字符串）或 TimerOptions（Omit `mode`）
 *
 * @example
 * ```ts
 * const t = createTicker('ws:');
 * const stopHeartbeat = t.set('heartbeat', () => ws.ping(), 30000);
 * ```
 */
export const createTicker = (
  prefixOrOptions?: string | Omit<TimerOptions<'interval'>, 'mode'> | null,
) => createTimer(prefixOrOptions, 'interval');
