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
    const result = callback();
    // 如果 callback 返回 Promise 且 reject，catch 避免 unhandled rejection
    if (result instanceof Promise) {
      result.catch(console.error);
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
    const result = callback();
    if (result instanceof Promise) {
      result.catch(console.error);
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
