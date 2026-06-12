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

const _validateMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`ms must be a finite non-negative number, got ${ms}`);
  }
};

/** 包裹 callback，try/catch 同步 throw + Promise.catch async reject */
const _safeRun = (callback: () => void | Promise<void>) => {
  try {
    const result = callback();
    if (result instanceof Promise) {
      result.catch(console.error);
    }
  } catch (err) {
    console.error(err);
  }
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
 * @param prefix — key 前缀（建议以 `:` 结尾，如 `'api:'`）。
 *   传空字符串可作"全局"实例使用。
 *
 * @example
 * ```ts
 * const t = createTimer('api:');
 *
 * const stopPoll = t.set('poll', () => fetch('/status'), 5000);
 * stopPoll();            // 或 t.clear('poll')
 * t.clearAll();          // 只清 'api:*'
 * ```
 */
export const createTimer = (prefix: string): TimerHandle => {
  const store: Record<string, ReturnType<typeof setTimeout>> = {};
  const fullKey = (key: string) => `${prefix}${key}`;

  const clear = (key: string) => {
    const k = fullKey(key);
    if (Object.hasOwn(store, k)) {
      clearTimeout(store[k]);
      delete store[k];
    }
  };

  return {
    set(key, callback, ms) {
      _validateMs(ms);
      clear(key);
      const k = fullKey(key);
      store[k] = setTimeout(() => _safeRun(callback), ms);
      return () => clear(key);
    },

    clear,

    clearAll() {
      const keys = Object.keys(store);
      for (const key of keys) {
        clearTimeout(store[key]);
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
 * @param prefix — key 前缀
 *
 * @example
 * ```ts
 * const t = createTicker('ws:');
 * const stopHeartbeat = t.set('heartbeat', () => ws.ping(), 30000);
 * ```
 */
export const createTicker = (prefix: string): TimerHandle => {
  const store: Record<string, ReturnType<typeof setInterval>> = {};
  const fullKey = (key: string) => `${prefix}${key}`;

  const clear = (key: string) => {
    const k = fullKey(key);
    if (Object.hasOwn(store, k)) {
      clearInterval(store[k]);
      delete store[k];
    }
  };

  return {
    set(key, callback, ms) {
      _validateMs(ms);
      clear(key);
      const k = fullKey(key);
      store[k] = setInterval(() => _safeRun(callback), ms);
      return () => clear(key);
    },

    clear,

    clearAll() {
      const keys = Object.keys(store);
      for (const key of keys) {
        clearInterval(store[key]);
        delete store[key];
      }
    },
  };
};
