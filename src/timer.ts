import { _typeFunc } from './_internal';
import { isInferObject, isString } from './guards';

const _errTimerModeInvalid = 'Timer mode invalid';

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

/**
 * timer 的运行模式
 *
 * - `'timeout'`：`setTimeout`，到点触发一次
 * - `'interval'`：`setInterval`，按设定间隔循环触发
 * - 自定义对象：{@link TimerCustomMode}，换成自己的 set / clear，
 *   requestAnimationFrame、测试 fake timer 等场景
 */
export type TimerMode = 'timeout' | 'interval' | TimerCustomMode;

/**
 * 注册定时回调的函数签名：延迟 `ms` 毫秒后调用 `fn`，返回用于清除的 id
 *
 * {@link TimerCustomMode} 的 `set` 就是这个形状。实现自定义模式时
 * 可直接引用，比如先接住返回 number id 的原生函数：
 *
 * ```ts
 * const nativeSet: SetTimer<number> = (fn, ms) => setTimeout(fn, ms);
 * ```
 *
 * @typeParam Id — `set` 返回值的类型，默认 `string`；
 *   同一模式里 {@link TimerCustomMode.clear} 的参数就是这个类型
 */
export type SetTimer<Id = string> = (fn: () => void, ms: number) => Id;

/**
 * 自定义模式的实现接口：一对自己的 set / clear
 *
 * 作为 `mode` 传给 {@link createTimer}（第二参或配置对象的 `mode` 字段），
 * 替换平台定时器。经 `createTimer` 使用时 `Id` 必须是 `string`
 * （`TimerMode` 的约束），原生 API 返回 number 等类型的 id 时先转成 string：
 *
 * ```ts
 * const nativeSet: SetTimer<number> = (fn, ms) => requestAnimationFrame(fn);
 * const rafMode: TimerCustomMode<string> = {
 *   set: (fn, ms) => String(nativeSet(fn, ms)),
 *   clear: (id) => cancelAnimationFrame(Number(id)),
 * };
 * const t = createTimer('raf', rafMode);
 * ```
 *
 * @typeParam Id — `set` 返回值的类型，从 `set` 的实现推断；
 *   `clear` 接收同类型，默认 `string`
 */
export interface TimerCustomMode<Id = string> {
  /** 注册回调，返回交给 clear 的 id */
  set: SetTimer<Id>;

  /** 清除 set 返回的那个 id 对应的任务 */
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

/**
 * {@link createTimer} 第一个参数的配置对象形式
 *
 * 带索引签名：允许携带额外字段，timer 只读取 `prefix` / `mode` / `onError`。
 *
 * @typeParam Mode — `mode` 字段的模式类型，默认 `'timeout'`
 */
export interface TimerOptions<Mode extends TimerMode = 'timeout'> {
  /**
   * key 前缀，注册的 key 拼成 `` `${prefix}:${key}` ``，
   * `onError` 收到的就是这个完整 key
   *
   * @defaultValue 不加前缀；空串和 null 同样视为无前缀
   */
  prefix?: string | null;

  /**
   * 运行模式，见 {@link TimerMode}；显式传给 {@link createTimer}
   * 的第二参会覆盖这里的值
   *
   * @defaultValue 'timeout'
   */
  mode?: Mode;

  /**
   * 回调同步抛错或返回的 Promise reject 时调用；不传则静默
   *
   * @param error — 回调抛出的错误，或 Promise reject 的原因
   * @param key — 带前缀的完整 key
   */
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
  mode?: Mode,
): TimerHandle => {
  // 显式第二参数 > 对象里的 mode > 'timeout'。第二参不设默认值：
  // 设了默认值后 mode || prefixOrOptions?.mode 的左侧恒为 truthy，
  // 对象配置里的 mode 永远不生效。opts 的 mode 放宽到全量 TimerMode：
  // Mode 只约束调用方的输入，内部实现按运行时值选 impl
  const opts: TimerOptions<TimerMode> = isString(prefixOrOptions)
    ? { prefix: prefixOrOptions, mode: mode ?? 'timeout' }
    : { ...prefixOrOptions, mode: mode ?? prefixOrOptions?.mode ?? 'timeout' };
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
): TimerHandle => createTimer(prefixOrOptions, 'interval');
