import type { AnyFunction } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Scope 冲突错误
 *
 * 当同一 `createPending` 实例下注册了重复的静态 scope 时抛出。
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

/** inflight entry，追踪 promise 和等待者数量 */
type InflightEntry<T> = {
  promise: Promise<T>;
  counter: { value: number };
};

// ============================================================================
// PendingHandle
// ============================================================================

/**
 * `createPending` 返回的实例接口
 *
 * 每个实例持有独立的 scope 注册表，实例间互不干扰。
 */
export interface PendingHandle {
  /**
   * 感知 pending 状态的 inflight 去重。
   *
   * fn 的第一个参数为 {@link PendingFnParams}，包含 scope 和 getPendingCount，
   * 允许根据 pending 状态做自定义处理（如短路检查、日志等）。
   * 返回的函数剥掉 PendingFnParams，只暴露业务参数。
   *
   * @param scope 静态 scope 字符串，或基于参数动态生成 scope 的函数
   * @param fn 接收 PendingFnParams 的回调函数
   * @returns 只保留业务参数的包装函数
   */
  pendingFn<T, Args extends unknown[]>(
    scope: string | ((...args: Args) => string),
    fn: PendingCallbackFn<T, Args>,
  ): (...args: Args) => Promise<Awaited<T>>;

  /**
   * 基于 scope 的 inflight 去重。
   *
   * 同一 scope 下并发调用只执行一次 fn，所有 callers 共享同一个 Promise 结果。
   * 执行完毕后 scope 释放，下一次调用开启新的执行周期。
   *
   * @param scope 静态 scope 字符串，或基于参数动态生成 scope 的函数
   * @param fn 要包装的函数（同步或异步）
   * @returns 包装后的去重函数
   */
  pending<F extends AnyFunction>(
    scope: string | ((...args: Parameters<F>) => string),
    fn: F,
  ): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>;

  /**
   * 清除此实例的 scope 注册表，允许已注册的 scope 重新注册。
   *
   * 用于测试场景（`afterEach`）或 HMR `dispose` 钩子中重置状态。
   */
  clear(): void;
}

// ============================================================================
// createPending
// ============================================================================

/**
 * 创建独立的 pending 实例
 *
 * 每个实例持有自己的 scope 注册表，实例间完全隔离。
 *
 * **HMR / 热重载场景**：在模块顶层调用 `createPending()` 而非使用全局的
 * `pending` / `pendingFn`——模块重新评估时自然得到全新实例，旧注册状态不再
 * 干扰，无需手动清理。
 *
 * @example
 * ```ts
 * // 模块内独立实例，HMR 重载后自动重置
 * const { pending, pendingFn } = createPending();
 *
 * const fetchConfig = pending('config', () => fetch('/api/config').then(r => r.json()));
 * ```
 *
 * @example Bun / Vite HMR dispose
 * ```ts
 * const myPending = createPending();
 * import.meta.hot?.dispose(() => myPending.clear());
 * ```
 */
export const createPending = (): PendingHandle => {
  const registry = new Set<string>();

  // biome-ignore lint/suspicious/noExplicitAny: accept any scope function signature
  const registerScope = (scope: string | ((...args: any[]) => string)) => {
    if (typeof scope === 'string') {
      if (registry.has(scope)) {
        throw new PendingScopeConflictError(scope);
      }
      registry.add(scope);
    }
  };

  const pendingFn = <T, Args extends unknown[]>(
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

      // new Promise executor 同步执行，fn 在 inflight.set 前调用，
      // 保证 getPendingCount() 首次返回 0；constructor 同时捕获同步 throw
      const promise = new Promise<Awaited<T>>((resolve) => {
        resolve(fn(params, ...args) as Awaited<T> | PromiseLike<Awaited<T>>);
      }).finally(() => {
        inflight.delete(key);
      });

      inflight.set(key, { promise, counter });
      return promise;
    };
  };

  const pending = <F extends AnyFunction>(
    scope: string | ((...args: Parameters<F>) => string),
    fn: F,
  ): ((...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>) => {
    return pendingFn(scope, (_params, ...args) => fn(...args));
  };

  return {
    pending,
    pendingFn,
    clear: () => registry.clear(),
  };
};

// ============================================================================
// Global default instance
// ============================================================================

/**
 * 全局默认 pending 实例
 *
 * `pending` / `pendingFn` / `clearPendingRegistry` 均绑定到此实例。
 * 全局实例跨模块共享同一 scope 注册表——**静态 scope 必须全局唯一**，
 * 否则任意模块重新加载都会触发 {@link PendingScopeConflictError}。
 *
 * 如需隔离，请改用 {@link createPending} 创建独立实例。
 */
const _defaultPending = createPending();

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
export const clearPendingRegistry = (): void => _defaultPending.clear();

/**
 * 感知 pending 状态的 inflight 去重（全局实例）
 *
 * fn 的第一个参数为 {@link PendingFnParams}，包含 scope 和 getPendingCount，
 * 允许根据 pending 状态做自定义处理（如短路检查、日志等）。
 * 返回的函数剥掉 PendingFnParams，只暴露业务参数。
 *
 * **全局实例注意**：静态 scope 必须在整个应用内唯一。HMR 场景下请改用
 * {@link createPending} 创建模块级独立实例。
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
 *     const existing = document.getElementById(scope);
 *     if (existing) return { element: existing };
 *     return loadScript(url);
 *   },
 * );
 *
 * await Promise.all([mountScript('/lib.js'), mountScript('/lib.js')]);
 * ```
 */
export const pendingFn: PendingHandle['pendingFn'] = _defaultPending.pendingFn;

/**
 * 基于 scope 的 inflight 去重（全局实例）
 *
 * 同一 scope 下并发调用只执行一次 fn，所有 callers 共享同一个 Promise 结果。
 * 执行完毕后 scope 释放，下一次调用开启新的执行周期。
 *
 * **全局实例注意**：静态 scope 必须在整个应用内唯一。HMR 场景下请改用
 * {@link createPending} 创建模块级独立实例。
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
 * ```
 *
 * @example 动态 scope
 * ```ts
 * const fetchUser = pending(
 *   (id: string) => `user:${id}`,
 *   (id: string) => fetch(`/api/user/${id}`).then(r => r.json()),
 * );
 *
 * await Promise.all([fetchUser('1'), fetchUser('1'), fetchUser('2')]);
 * ```
 */
export const pending: PendingHandle['pending'] = _defaultPending.pending;
