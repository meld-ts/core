import type { AnyFunction } from '../types';

/**
 * 全局 scope 注册表，防止不同 pending 声明使用相同的静态 scope
 */
const scopeRegistry = new Set<string>();

/**
 * 清除全局 scope 注册表
 *
 * 用于测试场景中重置静态 scope 的冲突检测状态。
 * 调用后此前注册的 scope 可被重新注册。
 *
 * @example
 * ```ts
 * afterEach(() => clearPendingRegistry());
 * ```
 */
export const clearPendingRegistry = () => {
  scopeRegistry.clear();
};

/**
 * Scope 冲突错误
 */
export class PendingScopeConflictError extends Error {
  constructor(public readonly scope: string) {
    super(`Pending scope "${scope}" is already registered`);
    this.name = 'PendingScopeConflictError';
  }
}

/**
 * pendingFn 回调函数接收的参数
 */
export type PendingFnParams = {
  /** 解析后的 scope key */
  scope: string;
  /**
   * 获取与当前调用共享同一 inflight 的额外等待者数量
   *
   * 首次触发者的 counter 初始为 0，后续并发 caller 会累加。
   * 值为 0 表示只有当前调用在执行，无其他并发 caller 等待。
   */
  getPendingCount: () => number;
};

/**
 * pendingFn 的回调函数类型
 */
export type PendingCallbackFn<T, Args extends unknown[]> = (
  params: PendingFnParams,
  ...args: Args
) => T;

/**
 * inflight entry，追踪 promise 和等待者数量
 */
type InflightEntry<T> = {
  promise: Promise<T>;
  counter: { value: number };
};

/**
 * 注册静态 scope，重复则抛出 PendingScopeConflictError
 */
// biome-ignore lint/suspicious/noExplicitAny: accept any scope function signature
const registerScope = (scope: string | ((...args: any[]) => string)) => {
  if (typeof scope === 'string') {
    if (scopeRegistry.has(scope)) {
      throw new PendingScopeConflictError(scope);
    }
    scopeRegistry.add(scope);
  }
};

/**
 * 感知 pending 状态的 inflight 去重
 *
 * fn 的第一个参数为 PendingFnParams，包含 scope 和 getPendingCount，
 * 允许根据 pending 状态做自定义处理（如短路检查、日志等）。
 * 返回的函数剥掉 PendingFnParams，只暴露业务参数。
 *
 * @param scope 静态 scope 字符串，或基于参数动态生成 scope 的函数
 * @param fn 接收 PendingFnParams 的回调函数
 * @returns 只保留业务参数的包装函数
 *
 * @example
 * ```ts
 * const mountScript = pendingFn(
 *   (url: string) => `script:${url}`,
 *   ({ scope, getPendingCount }, url: string) => {
 *     // 短路：已挂载
 *     const existing = document.getElementById(scope);
 *     if (existing) return { element: existing };
 *
 *     // 实际挂载，执行期间 getPendingCount() 可获取等待数
 *     return loadScript(url);
 *   },
 * );
 *
 * // 并发调用，只执行一次挂载
 * await Promise.all([mountScript('/lib.js'), mountScript('/lib.js')]);
 * ```
 */
export const pendingFn = <T, Args extends unknown[]>(
  scope: string | ((...args: Args) => string),
  fn: PendingCallbackFn<T, Args>,
): ((...args: Args) => Promise<Awaited<T>>) => {
  registerScope(scope);

  const inflight = new Map<string, InflightEntry<Awaited<T>>>();

  return (...args: Args) => {
    const key = typeof scope === 'function' ? scope(...args) : scope;

    const existing = inflight.get(key);
    if (existing) {
      existing.counter.value++;
      return existing.promise;
    }

    const counter = { value: 0 };
    const params: PendingFnParams = {
      scope: key,
      getPendingCount: () => counter.value,
    };

    const promise = new Promise<Awaited<T>>((resolve) => {
      resolve(fn(params, ...args) as Awaited<T> | PromiseLike<Awaited<T>>);
    }).finally(() => {
      inflight.delete(key);
    });

    inflight.set(key, { promise, counter });
    return promise;
  };
};

/**
 * 基于 scope 的 inflight 去重
 *
 * 同一 scope 下并发调用只执行一次 fn，所有 callers 共享同一个 Promise 结果。
 * 执行完毕后 scope 释放，下一次调用开启新的执行周期。
 *
 * @param scope 静态 scope 字符串，或基于参数动态生成 scope 的函数
 * @param fn 要包装的函数（同步或异步）
 * @returns 包装后的去重函数
 *
 * @example 静态 scope
 * ```ts
 * const fetchConfig = pending('config', () => fetch('/api/config').then(r => r.json()));
 *
 * // 并发调用 3 次，只执行 1 次 fetch
 * const [a, b, c] = await Promise.all([fetchConfig(), fetchConfig(), fetchConfig()]);
 * // a === b === c
 * ```
 *
 * @example 动态 scope
 * ```ts
 * const fetchUser = pending(
 *   (id: string) => `user:${id}`,
 *   (id: string) => fetch(`/api/user/${id}`).then(r => r.json()),
 * );
 *
 * // 相同 id 去重，不同 id 独立执行
 * await Promise.all([fetchUser('1'), fetchUser('1'), fetchUser('2')]);
 * // fetchUser('1') 只执行一次，fetchUser('2') 独立执行一次
 * ```
 */
export const pending = <F extends AnyFunction>(
  scope: string | ((...args: Parameters<F>) => string),
  fn: F,
): ((...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>) => {
  return pendingFn(scope, (_params, ...args) => fn(...args));
};
