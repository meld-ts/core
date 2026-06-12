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
 * 或 `linkEvents` 在注册时自动使用 `emitter.once()` 而非 `emitter.on()`。
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
 */
export interface EventsEmitter<E extends EventsDefinition = EventsDefinition> {
  on<N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
  ): EventUnsubscribeFn;

  /**
   * 注册仅触发一次的监听器。
   *
   * **重要**：`once()` 注册的是内部包装函数，而非 `callback` 本身。
   * 因此 `emitter.off(name, originalCallback)` **无法移除** once 监听器。
   * 请始终通过返回的 `off` 函数来取消，或使用 `emitter.emit` 触发后自动移除。
   */
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
 * 回调声明中通过 {@link once}() 标注的回调自动使用 `emitter.once()` 注册。
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

export const isEventsDelegator = <
  E extends EventsDefinition = EventsDefinition,
>(
  obj: unknown,
): obj is EventsDelegator<E> =>
  isInferObject<EventsDelegator<E>>(
    obj,
    (it) => typeof it.inject === 'function' && typeof it.eject === 'function',
  );

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
 * - `on` 返回反注册函数
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

  const on = <N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
  ): EventUnsubscribeFn => {
    let set = listeners.get(name);
    if (set == null) {
      // biome-ignore lint/suspicious/noExplicitAny: set type matches on() signature
      set = new Set<EventCallbackFn<any>>();
      listeners.set(name, set);
    }
    set.add(callback);
    return () => off(name, callback);
  };

  const once = <N extends keyof E>(
    name: N,
    callback: EventCallbackFn<E[N]>,
  ): EventUnsubscribeFn => {
    const off = on(name, ((params: E[N]) => {
      off();
      return callback(params);
    }) as EventCallbackFn<E[N]>);
    return off;
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
          .then(() => fn(params))
          .catch((err) => errors.push(err)),
      ),
    );
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `emit(${String(name)}) had ${errors.length} error(s)`,
      );
    }
  };

  return { on, once, off, emit };
};

// ============================================================================
// linkEvents
// ============================================================================

/**
 * `linkEvents` 内部维护的反注册映射：
 * emitter → key → callback → unsubscriber
 *
 * `once()` 回调注册的是 wrapper，不能用 `emitter.off(key, originalCb)` 移除，
 * 因此需要持有 unsubscriber 以便 `linkEvents('off')` 正确清理。
 */
const _linkSubs = new WeakMap<
  EventsEmitter,
  Map<keyof any, Map<EventCallbackFn<any>, EventUnsubscribeFn>>
>();

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
        // once() 回调注册的是 wrapper，不能用 emitter.off 移除
        const subs = _linkSubs.get(emitter)?.get(key);
        if (subs) {
          const unsub = subs.get(fn);
          if (unsub) {
            unsub();
            subs.delete(fn);
          }
        }
      } else if (useOnce) {
        const unsub = emitter.once(key, fn);
        let subs = _linkSubs.get(emitter);
        if (!subs) _linkSubs.set(emitter, (subs = new Map()));
        let subMap = subs.get(key);
        if (!subMap) subs.set(key, (subMap = new Map()));
        subMap.set(fn, unsub);
      } else {
        const unsub = emitter.on(key, fn);
        let subs = _linkSubs.get(emitter);
        if (!subs) _linkSubs.set(emitter, (subs = new Map()));
        let subMap = subs.get(key);
        if (!subMap) subs.set(key, (subMap = new Map()));
        subMap.set(fn, unsub);
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
          unsubscribers.push(
            isOnce ? emitter.once(key, fn) : emitter.on(key, fn),
          );
        }
      }
    },

    eject: () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers = [];
    },
  };
};
