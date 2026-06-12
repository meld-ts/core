interface TimerHandle {
  set(
    key: string,
    callback: () => void | Promise<void>,
    ms: number,
  ): () => void;
  clear(key: string): void;
  clearAll(): void;
}

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
      clear(key);
      const k = fullKey(key);
      store[k] = setTimeout(() => _safeRun(callback), ms);
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
      clear(key);
      const k = fullKey(key);
      store[k] = setInterval(() => _safeRun(callback), ms);
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
