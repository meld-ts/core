import {
  type EventsCallbacks,
  type EventsEmitter,
  initEventsEmitter,
} from '../events';
import { isNumber, notEmptyString } from '../guards';
import { type TimerHandle, createTimer } from '../timer';
import { RpcAbortError, TimeoutError } from './errors';

export { RpcAbortError };

/** 事件映射：pending / resolve / reject / settle */
export type StatefulRpcEvents<Result, Params> = {
  pending: { task: StatefulRpcTask<Params> };
  resolve: { task: StatefulRpcTask<Params>; result: Result };
  reject: { task: StatefulRpcTask<Params>; result: unknown };
  settle: StatefulRpcSettled<Result> & { task: StatefulRpcTask<Params> };
};

/** 构造选项 */
export type StatefulRpcOptions<Result, Params> = {
  /** 实例 id 前缀，默认 `"stateful-rpc"` */
  idPrefix?: string;
  /** 默认超时毫秒数，默认 30000。必须 > 0，否则回退到 30000 */
  timeout?: number;
  /** 事件回调 */
  events?: EventsCallbacks<StatefulRpcEvents<Result, Params>>;
};

/**
 * 单次异步任务的描述信息，创建后冻结，不可修改。
 */
export interface StatefulRpcTask<Params> {
  /** 外部资源 key，同一个 key 可同时存在多个 task */
  readonly key: string;
  /** 内部唯一 task id，格式：`{instanceId}:{key}:{counter}` */
  readonly taskId: string;
  /** 调用 `pending()` 时传入的参数 */
  readonly params: Params;
  /** task 创建时间 */
  readonly date: Date;
}

type PendingItem<Result, Params> = {
  task: StatefulRpcTask<Params>;
  resolve: (resp: Result) => void;
  reject: (error: unknown) => void;
  timeout: number;
};

/**
 * `settle()` 的结果描述，区分 resolve / reject 两种情况。
 */
export type StatefulRpcSettled<Result> =
  | {
      key: string;
      type: 'resolve';
      result: Result;
    }
  | {
      key: string;
      type: 'reject';
      result: unknown;
    };

let counter = 0;

/**
 * 有状态的 RPC 等待注册表。
 *
 * 对同一个 `key` 的多个并发调用方共享同一次异步结果：任意一方调用
 * `resolve(key, result)` 或 `reject(key, error)` 时，所有等待该 key
 * 的 Promise 会同时被 settle。
 *
 * ### 超时行为
 * 每个 task 拥有独立的定时器。当任意一个 task 超时时，`onTimeout` 会
 * 调用 `settle(key)`，将该 key 下的**所有** task 一并 reject（含尚未
 * 超时的 task）。如需自定义超时逻辑，子类可覆盖 `protected onTimeout`。
 *
 * @example
 * ```ts
 * const rpc = new StatefulRpc<UserProfile, { userId: string }>();
 *
 * // 多个调用方等待同一个 key
 * const p1 = rpc.pending('user:42', { userId: '42' });
 * const p2 = rpc.pending('user:42', { userId: '42' });
 *
 * // 外部拿到数据后 resolve，p1 和 p2 同时得到结果
 * rpc.resolve('user:42', profile);
 * ```
 */
export class StatefulRpc<Result = object, Params = object> {
  #id: string;

  #pendings: Map<string, Map<string, PendingItem<Result, Params>>>;

  #timeout: number;

  #timer: TimerHandle;

  #taskCounter = 0;

  #emitter: EventsEmitter<StatefulRpcEvents<Result, Params>>;

  constructor({
    idPrefix,
    timeout,
    events,
  }: StatefulRpcOptions<Result, Params> = {}) {
    this.#id = `${notEmptyString(idPrefix) ? idPrefix : 'stateful-rpc'}-${counter++}`;
    this.#timeout = isNumber(timeout) && timeout > 0 ? timeout : 30 * 1000;
    this.#timer = createTimer(this.#id);
    this.#pendings = new Map();
    this.#emitter = initEventsEmitter(events);
  }

  /** 实例唯一 id */
  get id() {
    return this.#id;
  }

  /** 实例级默认超时毫秒数 */
  get timeout() {
    return this.#timeout;
  }

  /**
   * 返回当前挂起的 task 数量。
   * @param key 指定 key 时只统计该 key；省略时统计全部
   */
  getPendingCount(key?: string): number {
    if (key != null) return this.#pendings.get(key)?.size ?? 0;
    let count = 0;
    for (const items of this.#pendings.values()) count += items.size;
    return count;
  }

  /** 创建 PendingItem，不写入 Map、不启动计时器 */
  protected newPendingItem(
    key: string,
    params: Params,
    rest: Omit<PendingItem<Result, Params>, 'task'>,
  ): PendingItem<Result, Params> {
    const taskId = `${key}:${this.#taskCounter++}`;
    return {
      ...rest,
      task: Object.freeze({ key, taskId, params, date: new Date() }),
    };
  }

  /** 将 item 写入 Map 并启动定时器 */
  protected addPendingItem(
    item: PendingItem<Result, Params>,
  ): PendingItem<Result, Params> {
    const { key, taskId } = item.task;
    const map = this.#pendings.get(key);
    if (map == null) {
      this.#pendings.set(key, new Map([[taskId, item]]));
    } else {
      map.set(taskId, item);
    }
    this.#emitter.emit('pending', { task: item.task });
    this.#timer.set(taskId, () => this.onTimeout(item), item.timeout);
    return item;
  }

  /**
   * task 超时时触发，默认行为：以 `TimeoutError` reject 整个 key 下的所有 task。
   *
   * 子类可覆盖此方法实现自定义超时策略（如只 reject 超时的单个 task）。
   */
  protected onTimeout = ({ task, timeout }: PendingItem<Result, Params>) => {
    this.settle({
      key: task.key,
      type: 'reject',
      result: new TimeoutError(timeout, task),
    });
  };

  /** 从 Map 中移除 item 并清除其定时器 */
  protected removePendingItem(item: PendingItem<Result, Params>) {
    const { key, taskId } = item.task;
    const map = this.#pendings.get(key);
    if (map != null) {
      map.delete(taskId);
      if (map.size <= 0) {
        this.#pendings.delete(key);
      }
    }
    this.#timer.clear(taskId);
    return item;
  }

  /**
   * 注册一个等待 `key` 结果的 Promise。
   *
   * 同一个 `key` 可以多次调用 `pending()`；所有调用方会在同一次
   * `settle()` 时一起被 resolve 或 reject。
   *
   * @param key 资源标识，与 `resolve` / `reject` / `abort` 对应
   * @param params 本次请求的参数，会附加到 task 描述中
   * @param timeout 覆盖实例默认超时时间（毫秒）
   */
  pending(key: string, params: Params, timeout?: number): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      this.addPendingItem(
        this.newPendingItem(key, params, {
          resolve,
          reject,
          timeout: timeout ?? this.timeout,
        }),
      );
    });
  }

  /**
   * 以指定的 `settled` 结果一次性 settle `key` 下的所有 task，
   * 并触发对应事件。settle 后该 key 的所有 task 及定时器均被清除。
   *
   * @returns `this`，支持链式调用
   */
  settle(settled: StatefulRpcSettled<Result>): this {
    const map = this.#pendings.get(settled.key);
    if (map == null) return this;
    const items = [...map.values()];
    for (const it of items) {
      const { task } = it;
      this.removePendingItem(it);
      this.#emitter
        .emit(settled.type, { task, result: settled.result })
        .catch(console.error);
      this.#emitter
        .emit('settle', { ...settled, task: it.task })
        .catch(console.error);
      if (settled.type === 'resolve') {
        it.resolve(settled.result);
      } else {
        it.reject(settled.result);
      }
    }
    return this;
  }

  /**
   * resolve 指定 key 的所有 task。
   * @param key 资源标识
   * @param result 返回值
   * @returns `this`，支持链式调用
   */
  resolve = (key: string, result: Result): this =>
    this.settle({ key, type: 'resolve', result });

  /**
   * reject 指定 key 的所有 task。
   * @param key 资源标识
   * @param result 错误原因
   * @returns `this`，支持链式调用
   */
  reject = (key: string, result: unknown): this =>
    this.settle({ key, type: 'reject', result });

  /**
   * 以 `RpcAbortError` 中止指定 key 的所有 task。
   * @param key 资源标识
   * @param reason 可选的中止原因，会附加到 `RpcAbortError.reason`
   * @returns `this`，支持链式调用
   */
  abort = (key: string, reason?: unknown): this =>
    this.settle({ key, type: 'reject', result: new RpcAbortError(reason) });

  /**
   * 以 `RpcAbortError` 中止**所有** key 下的全部 task。
   * 通常在连接断开、组件卸载等场景下调用。
   * @param reason 可选的中止原因
   * @returns `this`，支持链式调用
   */
  clear(reason?: unknown): this {
    const error = new RpcAbortError(reason);
    for (const key of [...this.#pendings.keys()]) {
      this.settle({ key, type: 'reject', result: error });
    }
    return this;
  }
}
