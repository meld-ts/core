import { _typeFunc } from '../_internal';
import { isInferObject } from '../guards';

// ============================================================================
// Types
// ============================================================================

export type MaybePromise<T> = T | Promise<T>;

/**
 * 事件定义：以 `Record<EventName, EventData>` 表达
 */
// biome-ignore lint/suspicious/noExplicitAny: EventsDefinition needs to accept any value type
export type EventsDefinition = Record<PropertyKey, any>;

/** on() 返回的反注册函数 */
export type EventUnsubscribeFn = () => void;

/** 单个事件的监听函数 */
export type EventCallbackFn<T> = (params: T) => MaybePromise<void>;

/** 带 once 标记的回调包装 */
export type MarkedCallback<T> = {
  fn: EventCallbackFn<T>;
  once: boolean;
};

/** 单个事件的回调声明：函数 / 标记回调 / 数组混合 */
export type EventCallbackDeclaration<T> =
  | EventCallbackFn<T>
  | MarkedCallback<T>
  | (EventCallbackFn<T> | MarkedCallback<T>)[];

/** 多个事件的回调声明映射 */
export type EventsCallbacks<E extends EventsDefinition = EventsDefinition> =
  Partial<{
    [K in keyof E]: EventCallbackDeclaration<E[K]>;
  }>;

// ============================================================================
// once() factory
// ============================================================================

/**
 * 标记回调为"仅触发一次"
 *
 * 在 {@link EventsCallbacks} 声明中包裹回调，由 `createDelegator`
 * 或 `linkEvents` 在注册时自动使用 `emitter.on(key, fn, true)`。
 *
 * @example
 * ```ts
 * createDelegator({
 *   connect: once(({ id }) => console.log('first connect only', id)),
 *   tick: () => console.log('every tick'),
 * });
 * ```
 */
export const once = <T>(fn: EventCallbackFn<T>): MarkedCallback<T> => ({
  fn,
  once: true,
});

// ============================================================================
// Interfaces
// ============================================================================

/**
 * 事件发射器接口
 *
 * `on` 返回反注册函数，无需持有 callback 引用即可取消监听。
 * 传 `isOnce: true` 等同于 `once()`——首次触发后自动移除。
 */
export interface EventsEmitter<E extends EventsDefinition = EventsDefinition> {
  on<N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
    isOnce?: boolean,
  ): EventUnsubscribeFn;

  /** `on(name, callback, true)` 的便利封装 */
  once<N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
  ): EventUnsubscribeFn;

  off<N extends keyof E>(name: N, callback: EventCallbackFn<E[N]>): void;

  emit<N extends keyof E>(name: N, params: E[N]): Promise<void>;
}

/**
 * 事件委托者接口
 *
 * 通过 inject/eject 将自身的事件处理映射附加到或从 emitter 上解除。
 * 回调声明中通过 {@link once}() 标注的回调自动使用 `emitter.on(key, fn, true)` 注册。
 */
export interface EventsDelegator<
  E extends EventsDefinition = EventsDefinition,
> {
  inject(emitter?: EventsEmitter<E>): void;
  eject(): void;
}

/**
 * 事件输入联合类型：emitter / callbacks 对象 / delegator 三选一
 */
export type EventsInput<E extends EventsDefinition = EventsDefinition> =
  | EventsEmitter<E>
  | EventsCallbacks<E>
  | EventsDelegator<E>;

// ============================================================================
// Type guards
// ============================================================================

/**
 * 检查 obj 是否实现 {@link EventsDelegator} 接口
 *
 * 通过检测 `inject` 和 `eject` 两个方法是否存在来判定（鸭子类型）。
 * 任何满足此签名的对象均被视为 delegator。
 *
 * @param obj — 待检查的任意值
 * @returns `true` 当且仅当 obj 具有 inject/eject 方法，同时收窄为 `EventsDelegator<E>`
 */
export const isEventsDelegator = <
  E extends EventsDefinition = EventsDefinition,
>(
  obj: unknown,
): obj is EventsDelegator<E> =>
  isInferObject<EventsDelegator<E>>(
    obj,
    (it) => typeof it.inject === 'function' && typeof it.eject === 'function',
  );

/**
 * 检查 obj 是否实现 {@link EventsEmitter} 接口
 *
 * 通过检测 `emit`、`on`、`once`、`off` 四个方法是否存在来判定（鸭子类型）。
 * 任何满足此签名的对象均被视为 emitter。
 *
 * @param obj — 待检查的任意值
 * @returns `true` 当且仅当 obj 具有 emit/on/off 方法，同时收窄为 `EventsEmitter<E>`
 */
export const isEventsEmitter = <E extends EventsDefinition = EventsDefinition>(
  obj: unknown,
): obj is EventsEmitter<E> =>
  isInferObject<EventsEmitter<E>>(
    obj,
    (it) =>
      typeof it.emit === _typeFunc &&
      typeof it.on === _typeFunc &&
      typeof it.once === _typeFunc &&
      typeof it.off === _typeFunc,
  );

// ============================================================================
// createEmitter
// ============================================================================

/**
 * 创建事件发射器
 *
 * - 同一事件的所有监听器并发执行（Promise.all）
 * - `on(name, cb, true)` 等同于 `once()`——触发后自动移除
 * - `off(name, cb)` 直接通过引用匹配移除，对 `isOnce` 回调同样有效
 * - 任意监听器抛出时，emit 返回的 Promise 以 AggregateError 拒绝
 *
 * @example
 * ```ts
 * type AppEvents = { connect: { id: string }; disconnect: undefined };
 *
 * const emitter = createEmitter<AppEvents>();
 *
 * const off = emitter.on('connect', ({ id }) => console.log('connected', id));
 * await emitter.emit('connect', { id: 'user-1' });
 * off(); // 取消监听
 * ```
 */
export const createEmitter = <
  E extends EventsDefinition = EventsDefinition,
>(): EventsEmitter<E> => {
  // biome-ignore lint/suspicious/noExplicitAny: listener map uses any for per-event type flexibility
  const listeners = new Map<keyof E, Set<EventCallbackFn<any>>>();
  // 按事件隔离的 once 标记——同一 callback 可用于不同事件，互不干扰
  // biome-ignore lint/suspicious/noExplicitAny: uses any for per-event type flexibility
  const _onceSets = new Map<keyof E, WeakSet<EventCallbackFn<any>>>();

  const on = <N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
    isOnce?: boolean,
  ): EventUnsubscribeFn => {
    let set = listeners.get(name);
    if (set == null) {
      // biome-ignore lint/suspicious/noExplicitAny: set type matches on() signature
      set = new Set<EventCallbackFn<any>>();
      listeners.set(name, set);
    }
    set.add(callback);
    if (isOnce) {
      let ws = _onceSets.get(name);
      if (!ws) {
        ws = new WeakSet<EventCallbackFn<any>>();
        _onceSets.set(name, ws);
      }
      ws.add(callback);
    }
    return () => {
      // off 时同步清理 once 标记，防止重新 on(name, cb)（非 once）时被误删
      _onceSets.get(name)?.delete(callback);
      off(name, callback);
    };
  };

  const off = <N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
  ): void => {
    listeners.get(name)?.delete(callback);
  };

  const emit = async <N extends keyof E>(
    name: N,
    params: E[N],
  ): Promise<void> => {
    const set = listeners.get(name);
    if (set == null || set.size === 0) return;
    const errors: unknown[] = [];
    await Promise.all(
      [...set].map((fn) =>
        Promise.resolve()
          .then(async () => fn(params))
          .catch((err) => errors.push(err)),
      ),
    );
    // 触发后清理 once 回调（按事件隔离，不跨事件误删）
    const onceSet = _onceSets.get(name);
    for (const fn of [...set]) {
      if (onceSet?.has(fn)) {
        onceSet.delete(fn);
        off(name, fn);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `emit(${String(name)}) had ${errors.length} error(s)`,
      );
    }
  };

  return {
    on,
    once: <N extends keyof E>(name: N, callback: EventCallbackFn<E[N]>) =>
      on(name, callback, true),
    off,
    emit,
  };
};

// ============================================================================
// linkEvents
// ============================================================================

export type LinkEventMode = 'on' | 'once' | 'off';

/**
 * 将 callbacks 对象或 delegator 附加到（或从）emitter 上
 *
 * @param emitter 目标发射器
 * @param input   EventsCallbacks 或 EventsDelegator
 * @param mode    `'on'`（默认，普通监听）/ `'once'`（单次监听）/ `'off'`（移除监听）
 * @returns       emitter 本身，支持链式调用
 */
export const linkEvents = <E extends EventsDefinition = EventsDefinition>(
  emitter: EventsEmitter<E>,
  input: EventsCallbacks<E> | EventsDelegator<E>,
  mode: LinkEventMode = 'on',
): EventsEmitter<E> => {
  if (isEventsDelegator(input)) {
    mode === 'off' ? input.eject() : input.inject(emitter);
    return emitter;
  }

  for (const key of Object.keys(input) as (keyof E)[]) {
    const declaration = (input as EventsCallbacks<E>)[key];
    if (declaration == null) continue;
    const items = Array.isArray(declaration) ? declaration : [declaration];
    for (const item of items as (
      | EventCallbackFn<E[keyof E]>
      | MarkedCallback<E[keyof E]>
    )[]) {
      const fn = typeof item === 'function' ? item : item.fn;
      const useOnce =
        mode === 'once' ||
        (mode === 'on' && typeof item !== 'function' && item.once);

      if (mode === 'off') {
        emitter.off(key, fn);
      } else {
        // on / once 统一走 on(name, cb, isOnce)
        emitter.on(key, fn, useOnce);
      }
    }
  }
  return emitter;
};

// ============================================================================
// initEventsEmitter
// ============================================================================

/**
 * 初始化事件发射器
 *
 * - input 为 null/undefined：创建新 emitter
 * - input 已是 EventsEmitter：直接返回
 * - input 为 EventsCallbacks 或 EventsDelegator：创建新 emitter 并挂载
 *
 * @param input  可选输入（三种类型之一）
 * @param create 自定义创建函数（默认 createEmitter）
 */
export const initEventsEmitter = <
  E extends EventsDefinition = EventsDefinition,
>(
  input?: EventsInput<E> | null,
  create: () => EventsEmitter<E> = createEmitter,
): EventsEmitter<E> => {
  if (input == null) return create();
  if (isEventsEmitter<E>(input)) return input;
  return linkEvents(create(), input);
};

// ============================================================================
// createDelegator
// ============================================================================

/**
 * 创建函数式事件委托者
 *
 * 将一组回调映射（EventsCallbacks）封装为 EventsDelegator，通过 inject/eject
 * 与 emitter 绑定或解绑。inject 时存储反注册函数，eject 时统一清理。
 *
 * @param callbacks 事件回调映射
 * @returns EventsDelegator 实例
 *
 * @example
 * ```ts
 * type AppEvents = { data: { value: number }; close: undefined };
 *
 * const delegator = createDelegator<AppEvents>({
 *   data: ({ value }) => console.log('received', value),
 *   close: [() => console.log('closed'), () => cleanup()],
 * });
 *
 * delegator.inject(emitter);  // 注册所有回调
 * delegator.eject();          // 取消所有回调（无需传 emitter）
 * ```
 */
export const createDelegator = <E extends EventsDefinition = EventsDefinition>(
  callbacks: EventsCallbacks<E>,
): EventsDelegator<E> => {
  let unsubscribers: EventUnsubscribeFn[] = [];

  return {
    inject: (emitter) => {
      if (emitter == null) return;
      for (const unsub of unsubscribers) unsub();
      unsubscribers = [];

      for (const key of Object.keys(callbacks) as (keyof E)[]) {
        const declaration = callbacks[key];
        if (declaration == null) continue;
        const items = Array.isArray(declaration) ? declaration : [declaration];
        for (const item of items as (
          | EventCallbackFn<E[keyof E]>
          | MarkedCallback<E[keyof E]>
        )[]) {
          const fn = typeof item === 'function' ? item : item.fn;
          const isOnce = typeof item !== 'function' && item.once;
          unsubscribers.push(emitter.on(key, fn, isOnce));
        }
      }
    },

    eject: () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers = [];
    },
  };
};
