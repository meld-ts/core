import type { AnyFunction } from '../types';
import { TimeoutError } from './errors';

// ============================================================================
// Types
// ============================================================================

/**
 * 重试回调参数
 */
export type RetryFnParams = {
  /** 当前尝试次数（从 1 开始） */
  attempt: number;
  /** 触发本次重试的错误；首次执行时（attempt=1）为 `undefined` */
  error: unknown;
  /** 只读的重试选项，与调用 `retry`/`retryFn` 时传入的 options 一致 */
  readonly options: RetryOptions;
};

/**
 * 重试选项
 */
export type RetryOptions = {
  /** 最大尝试次数，默认 3 */
  attempts?: number;
  /** 重试间隔（毫秒），支持固定值或基于 RetryFnParams 的动态计算 */
  delay?: number | ((params: RetryFnParams) => number);
  /** 重试前的回调，可用于日志记录 */
  onRetry?: (params: RetryFnParams) => void;
};

/**
 * retryFn 的回调函数类型
 */
export type RetryCallbackFn<T, Args extends unknown[]> = (
  params: RetryFnParams,
  ...args: Args
) => T;

// ============================================================================
// Errors
// ============================================================================

const formatError = (err: unknown): string => {
  if (err == null) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
};

/**
 * 重试耗尽错误
 *
 * 当异步操作在达到最大重试次数后仍然失败时抛出。
 * `attempt` / `error` / `options` 来自最后一次重试的上下文。
 *
 * @param params — 最后一次重试的上下文参数
 */
export class RetryExhaustedError extends Error {
  public readonly attempt: number;
  public readonly error: unknown;
  public readonly options: RetryOptions;

  constructor(params: RetryFnParams) {
    super(
      `Retry exhausted after ${params.attempt} attempts: ${formatError(params.error)}`,
    );
    this.name = 'RetryExhaustedError';
    this.attempt = params.attempt;
    this.error = params.error;
    this.options = params.options;
  }
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * 内部重试执行器
 */
const executeWithRetry = async <T>(
  fn: (attempt: number, error: unknown) => T,
  options: RetryOptions,
): Promise<Awaited<T>> => {
  const { attempts = 3, delay = 100, onRetry } = options;

  const execute = async (
    attempt: number,
    lastError: unknown,
  ): Promise<Awaited<T>> => {
    try {
      return await fn(attempt, lastError);
    } catch (err) {
      const params: RetryFnParams = {
        attempt,
        error: err,
        options,
      };

      if (attempt >= attempts) {
        throw new RetryExhaustedError(params);
      }

      const delayMs = typeof delay === 'function' ? delay(params) : delay;
      onRetry?.(params);

      await sleep(delayMs);
      return execute(attempt + 1, err);
    }
  };

  return execute(1, undefined);
};

/**
 * 透明包装异步/同步函数，返回自动重试的版本
 *
 * 返回的函数保持原函数的参数签名，返回值统一为 Promise
 *
 * @param fn 要包装的函数（同步或异步）
 * @param options 重试选项
 * @returns 包装后的函数
 *
 * @example
 * ```ts
 * const fetchUserWithRetry = retry(
 *   (id: string) => fetch(`/api/user/${id}`).then(r => r.json()),
 *   { attempts: 3, delay: 1000 },
 * );
 *
 * const user = await fetchUserWithRetry('123');
 * ```
 *
 * @example 指数退避
 * ```ts
 * const fetchWithBackoff = retry(fetchData, {
 *   attempts: 5,
 *   delay: ({ attempt }) => Math.min(1000 * 2 ** (attempt - 1), 30000),
 * });
 * ```
 */
export const retry = <F extends AnyFunction>(
  fn: F,
  options: RetryOptions = {},
): ((...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>) => {
  return (...args: Parameters<F>) =>
    executeWithRetry((_attempt, _error) => fn(...args), options);
};

/**
 * 创建感知重试状态的函数
 *
 * fn 的第一个参数为 RetryFnParams，包含 attempt 和 options，
 * 允许根据重试次数做差异化处理。返回的函数剥掉 RetryFnParams，
 * 只暴露业务参数。
 *
 * @param fn 接收 RetryFnParams 的回调函数
 * @param options 重试选项
 * @returns 只保留业务参数的包装函数
 *
 * @example
 * ```ts
 * const fetchWithFallback = retryFn(
 *   ({ attempt }, id: string) => {
 *     const url = attempt === 1 ? '/api/primary' : '/api/fallback';
 *     return fetch(`${url}/${id}`).then(r => r.json());
 *   },
 *   { attempts: 3 },
 * );
 *
 * const data = await fetchWithFallback('123');
 * ```
 */
export const retryFn = <T, Args extends unknown[]>(
  fn: RetryCallbackFn<T, Args>,
  options: RetryOptions = {},
): ((...args: Args) => Promise<Awaited<T>>) => {
  const frozenOptions = Object.freeze({ ...options });
  return (...args: Args) =>
    executeWithRetry(
      (attempt, error) =>
        fn({ attempt, error, options: frozenOptions }, ...args),
      options,
    );
};

/**
 * 包装函数，添加超时控制
 *
 * 返回的函数保持原函数的参数签名，返回值统一为 Promise。
 * 如果执行超过指定时间，将抛出 TimeoutError。
 *
 * @param fn 要包装的函数（同步或异步）
 * @param ms 超时毫秒数
 * @returns 包装后的函数
 *
 * @example
 * ```ts
 * const fetchWithTimeout = timeout(
 *   (url: string) => fetch(url).then(r => r.json()),
 *   5000,
 * );
 *
 * const data = await fetchWithTimeout('/api/data');
 * ```
 */
export const timeout = <F extends AnyFunction>(
  fn: F,
  ms: number,
): ((...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>) => {
  return (...args: Parameters<F>) => {
    let timerId: ReturnType<typeof setTimeout>;
    return Promise.race([
      Promise.resolve(fn(...args)).finally(() => clearTimeout(timerId)),
      new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new TimeoutError(ms)), ms);
      }),
    ]);
  };
};

/**
 * 延迟指定毫秒数，可选延迟后执行函数
 *
 * @param ms 延迟毫秒数
 * @param fn 延迟后执行的函数（可选）
 * @returns 无 fn 时返回 Promise<void>，有 fn 时返回 Promise<Awaited<ReturnType<F>>>
 *
 * @example
 * ```ts
 * // 纯等待
 * await sleep(1000);
 *
 * // 延迟后执行
 * const data = await sleep(1000, () => fetchData());
 * ```
 */
export function sleep(ms: number): Promise<void>;
export function sleep<F extends AnyFunction>(
  ms: number,
  fn: F,
): Promise<Awaited<ReturnType<F>>>;
export function sleep(ms: number, fn?: AnyFunction): Promise<unknown> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(fn ? fn() : undefined), ms),
  );
}
