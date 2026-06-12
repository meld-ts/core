const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * 命名 setTimeout，同一 key 会先清除已有的定时器再重新设置
 *
 * @param key — 定时器标识（建议加前缀避免冲突）
 * @param callback — 回调函数（支持 async，reject 会输出 console.error）
 * @param ms — 延迟毫秒数
 * @returns setTimeout 返回的 timer ID
 *
 * @example
 * ```ts
 * timer('poll', () => fetch('/api/status'), 5000);
 * clearTimer('poll');
 * ```
 */
export const timer = (
  key: string,
  callback: () => void | Promise<void>,
  ms: number,
): ReturnType<typeof setTimeout> => {
  clearTimer(key);
  timers[key] = setTimeout(() => {
    try {
      const result = callback();
      // async reject → Promise.catch 兜底，避免 unhandled rejection
      if (result instanceof Promise) {
        result.catch(console.error);
      }
    } catch (err) {
      // 同步 throw → catch 兜底，避免 uncaught exception
      console.error(err);
    }
  }, ms);
  return timers[key];
};

/**
 * 清除命名 setTimeout
 *
 * @param key — 定时器标识，不存在时静默返回
 */
export const clearTimer = (key: string): void => {
  if (Object.hasOwn(timers, key)) {
    clearTimeout(timers[key]);
    delete timers[key];
  }
};

/**
 * 清除所有命名 setTimeout（用于测试 teardown 或应用退出）
 */
export const clearAllTimers = (): void => {
  for (const key of Object.keys(timers)) {
    clearTimeout(timers[key]);
  }
  // 清空对象而非替换引用——如果有外部持有 timers 引用则不受影响
  for (const key of Object.keys(timers)) {
    delete timers[key];
  }
};

const tickers: Record<string, ReturnType<typeof setInterval>> = {};

/**
 * 命名 setInterval，同一 key 会先清除已有的间隔器再重新设置
 *
 * @param key — 间隔器标识（建议加前缀避免冲突）
 * @param callback — 回调函数（支持 async，reject 会输出 console.error）
 * @param ms — 间隔毫秒数
 * @returns setInterval 返回的 interval ID
 *
 * @example
 * ```ts
 * ticker('heartbeat', () => ws.ping(), 30000);
 * clearTicker('heartbeat');
 * ```
 */
export const ticker = (
  key: string,
  callback: () => void | Promise<void>,
  ms: number,
): ReturnType<typeof setInterval> => {
  clearTicker(key);
  tickers[key] = setInterval(() => {
    try {
      const result = callback();
      if (result instanceof Promise) {
        result.catch(console.error);
      }
    } catch (err) {
      console.error(err);
    }
  }, ms);
  return tickers[key];
};

/**
 * 清除命名 setInterval
 *
 * @param key — 间隔器标识，不存在时静默返回
 */
export const clearTicker = (key: string): void => {
  if (Object.hasOwn(tickers, key)) {
    clearInterval(tickers[key]);
    delete tickers[key];
  }
};

/**
 * 清除所有命名 setInterval（用于测试 teardown 或应用退出）
 */
export const clearAllTickers = (): void => {
  for (const key of Object.keys(tickers)) {
    clearInterval(tickers[key]);
  }
  for (const key of Object.keys(tickers)) {
    delete tickers[key];
  }
};

// ── 工厂 API（推荐） ──────────────────────────────────────────

interface TimerHandle {
  set(
    key: string,
    callback: () => void | Promise<void>,
    ms: number,
  ): () => void;
  clear(key: string): void;
  clearAll(): void;
}

/**
 * 创建带前缀的 timer 实例
 *
 * 与全局 `timer`/`clearTimer` 相比，工厂版本自动给 key 加前缀，
 * 避免不同模块间的 key 冲突，且 `clearAll()` 只清自己前缀下的定时器。
 *
 * `set()` 返回一个清除函数，可以直接用于组件卸载等场景，
 * 无需通过 `key` 查找。
 *
 * @param prefix — key 前缀（建议以 `:` 结尾，如 `'api:'`）
 *
 * @example
 * ```ts
 * const t = createTimer('api:');
 *
 * // 设置定时器，返回清理函数
 * const stopPoll = t.set('poll', () => fetch('/status'), 5000);
 *
 * // 按 key 清除
 * t.clear('poll');
 *
 * // 或调用返回的清理函数（等效）
 * stopPoll();
 *
 * // 清除该实例所有定时器
 * t.clearAll();
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
      clear(key);
      const k = fullKey(key);
      store[k] = setTimeout(() => {
        try {
          const result = callback();
          if (result instanceof Promise) {
            result.catch(console.error);
          }
        } catch (err) {
          console.error(err);
        }
      }, ms);
      return () => clear(key);
    },

    clear,

    clearAll() {
      for (const key of Object.keys(store)) {
        clearTimeout(store[key]);
      }
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
  };
};

/**
 * 创建带前缀的 ticker 实例
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
      clear(key);
      const k = fullKey(key);
      store[k] = setInterval(() => {
        try {
          const result = callback();
          if (result instanceof Promise) {
            result.catch(console.error);
          }
        } catch (err) {
          console.error(err);
        }
      }, ms);
      return () => clear(key);
    },

    clear,

    clearAll() {
      for (const key of Object.keys(store)) {
        clearInterval(store[key]);
      }
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
  };
};
