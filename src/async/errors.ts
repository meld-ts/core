/**
 * 超时错误
 *
 * 由 {@link timeout} 包装函数和 {@link StatefulRpc} 的超时机制抛出。
 *
 * @example
 * ```ts
 * try {
 *   await timeout(fetchData, 5000)('/api/data');
 * } catch (err) {
 *   if (err instanceof TimeoutError) {
 *     console.log(`timed out after ${err.ms}ms`);
 *   }
 * }
 * ```
 */
export class TimeoutError extends Error {
  /**
   * @param ms — 超时毫秒数
   * @param data — 可选的附加数据（如 task 描述），通过 {@link StatefulRpc.onTimeout} 传入
   */
  constructor(
    public readonly ms: number,
    public readonly data?: unknown,
  ) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * RPC 中止错误
 *
 * 由 {@link StatefulRpc.abort} 和 {@link StatefulRpc.clear} 抛出。
 * `reason` 可通过 `abort(key, reason)` 传入，方便调用方区分中止原因。
 *
 * @example
 * ```ts
 * try {
 *   await rpc.pending('req', params);
 * } catch (err) {
 *   if (err instanceof RpcAbortError) {
 *     console.log('aborted:', err.reason);
 *   }
 * }
 * ```
 */
export class RpcAbortError extends Error {
  /**
   * @param reason — 可选的中止原因，会附加到错误消息中
   */
  constructor(public readonly reason?: unknown) {
    const detail =
      reason != null
        ? `: ${reason instanceof Error ? reason.message : String(reason)}`
        : '';
    super(`RPC aborted${detail}`);
    this.name = 'RpcAbortError';
  }
}
