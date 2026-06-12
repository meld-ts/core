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

/** 单个事件的回调声明：单个函数或函数数组 */
export type EventCallbackDeclaration<T> =
  | EventCallbackFn<T>
  | EventCallbackFn<T>[];

/** 多个事件的回调声明映射 */
export type EventsCallbacks<E extends EventsDefinition = EventsDefinition> =
  Partial<{
    [K in keyof E]: EventCallbackDeclaration<E[K]>;
  }>;

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
 *
 * **注意**：`eject` 的 `emitter` 参数在当前实现中不被使用——
 * eject 通过内部存储的反注册函数清理，无需传入 emitter。
 * 保留该参数仅为接口兼容性。
 */
export interface EventsDelegator<
  E extends EventsDefinition = EventsDefinition,
> {
  inject(emitter?: EventsEmitter<E>): void;
  /** @deprecated emitter 参数不被使用，eject 通过内部反注册函数清理 */
  eject(emitter?: EventsEmitter<E>): void;
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
      typeof it.emit === 'function' &&
      typeof it.on === 'function' &&
      typeof it.off === 'function',
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

export type LinkEventMode = 'on' | 'off';

/**
 * 将 callbacks 对象或 delegator 附加到（或从）emitter 上
 *
 * @param emitter 目标发射器
 * @param input   EventsCallbacks 或 EventsDelegator
 * @param mode    'on'（默认，添加监听）或 'off'（移除监听）
 * @returns       emitter 本身（链式调用）
 */
export const linkEvents = <E extends EventsDefinition = EventsDefinition>(
  emitter: EventsEmitter<E>,
  input: EventsCallbacks<E> | EventsDelegator<E>,
  mode: LinkEventMode = 'on',
): EventsEmitter<E> => {
  if (isEventsDelegator(input)) {
    mode === 'on' ? input.inject(emitter) : input.eject(emitter);
    return emitter;
  }

  for (const key of Object.keys(input) as (keyof E)[]) {
    const declaration = (input as EventsCallbacks<E>)[key];
    if (declaration == null) continue;
    const fns = Array.isArray(declaration) ? declaration : [declaration];
    for (const fn of fns as EventCallbackFn<E[keyof E]>[]) {
      if (mode === 'on') {
        emitter.on(key, fn);
      } else {
        emitter.off(key, fn);
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
        const fns = Array.isArray(declaration) ? declaration : [declaration];
        for (const fn of fns as EventCallbackFn<E[keyof E]>[]) {
          unsubscribers.push(emitter.on(key, fn));
        }
      }
    },

    eject: () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers = [];
    },
  };
};
