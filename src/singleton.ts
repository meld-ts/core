import type { AnyFunction } from './types';

/**
 * 单例工厂
 *
 * 同步工厂返回 T，异步工厂返回 Promise<T>。
 * 异步分支内部处理并发竞态：多个并发调用只执行一次工厂，共享同一个 inflight Promise。
 *
 * @param factory 工厂函数（同步或异步均可）
 * @returns 包装后的函数，首次调用执行工厂，后续调用直接返回缓存实例
 *
 * @example 同步
 * ```ts
 * const getDb = singleton(() => new Database());
 * const db = getDb(); // 每次调用返回同一个实例
 * ```
 *
 * @example 异步
 * ```ts
 * const getClient = singleton(async () => {
 *   const client = new ApiClient();
 *   await client.connect();
 *   return client;
 * });
 *
 * // 并发调用，只初始化一次
 * const [a, b] = await Promise.all([getClient(), getClient()]);
 * // a === b
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: overload constraint requires any to match all async factories
export function singleton<F extends (...args: any[]) => Promise<any>>(
  factory: F,
): (...args: Parameters<F>) => ReturnType<F>;
export function singleton<F extends AnyFunction>(
  factory: F,
): (...args: Parameters<F>) => ReturnType<F>;
export function singleton(factory: AnyFunction): AnyFunction {
  let instance: unknown;
  let ready = false;
  let isAsync = false;
  let inflight: Promise<unknown> | undefined;

  return (...args: unknown[]) => {
    if (ready) {
      return isAsync ? Promise.resolve(instance) : instance;
    }
    if (inflight != null) return inflight;

    const result = factory(...args);

    if (result instanceof Promise) {
      isAsync = true;
      inflight = result
        .then((resolved: unknown) => {
          instance = resolved;
          ready = true;
          return resolved;
        })
        .finally(() => {
          inflight = undefined;
        });
      return inflight;
    }

    instance = result;
    ready = true;
    return instance;
  };
}
