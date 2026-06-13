---
name: meld-ts-core
description: "Using @meld-ts/core in a project — complete export reference, import paths, and key design notes for guards, events, async tools (StatefulRpc / pending / retry), traits/mixin system, and path utils."
disable-model-invocation: false
user-invocable: false
---

## What is @meld-ts/core

Zero-dependency TypeScript utility library, extracted from
[@zenstone/ts-utils](https://www.npmjs.com/package/@zenstone/ts-utils).
Targets Node.js / Bun (`dist/` ESM + CJS) and browsers (`browser/` ESM + iife).

Install: `npm install @meld-ts/core` / `bun add @meld-ts/core`

---

## `@meld-ts/core` — main entry

Types + guards + base. Import anything in this group from the main entry.

### Types

| Export | Description |
|--------|-------------|
| `ErrorLike` | `{ message?: string; error?: string }` — used by `isErrorLike` |
| `Constructor<T>` | `new (...args: any[]) => T` |
| `TypeGuard<T>` | `(val: unknown) => val is T` |
| `InferGuard<G>` | Extracts `T` from `TypeGuard<T>` — auto-distributes over unions |
| `AnyFunction` | `(...args: any[]) => any` — base type for function generic constraints |

### Base

| Export | Signature | Notes |
|--------|-----------|-------|
| `cloneObject` | `<T extends object>(obj: T): T` | Tries `structuredClone` → JSON → `Object.assign` |
| `cloneObjectByJson` | `<T extends object>(obj: T): T` | JSON deep clone; falls back to `Object.assign` on failure (e.g. circular ref). **Caution**: if `obj` is an array and `JSON.stringify` fails, fallback returns `{}` structure, not an array |
| `cloneObjectByAssign` | `<T extends object>(obj: T): T` | Shallow clone only — nested objects share references |

### Guards — string

| Export | Signature |
|--------|-----------|
| `isString` | `(val): val is string` |
| `notEmptyString` | `(val): val is string` — string with `length > 0`. **Note**: whitespace-only strings pass (`' '` → true) |

### Guards — number

| Export | Signature | Notes |
|--------|-----------|-------|
| `isNumber` | `(val): val is number` | Finite, non-NaN. Excludes `NaN`, `Infinity`, `-Infinity` |
| `isInt` | `(val): val is number` | Finite integer |
| `isNumberVal` | `(val): boolean` | Returns `true` if parseable as finite number (uses `parseFloat`). `'123abc'` → `true` |
| `toNumber` | `(val, dft = 0): number` | Converts to number; booleans become 1/0; returns `dft` on failure |
| `limitNumberMin` | `(val, min, dft?): number` | Clamps at lower bound |
| `limitNumberMax` | `(val, max, dft?): number` | Clamps at upper bound |
| `limitNumberMinMax` | `(val, min, max, dft?): number` | Clamps to `[min, max]` |
| `decimalAdjust` | `(type, value, exp?): number` | Base precision function. `type`: `'round'`/`'ceil'`/`'floor'`; `exp`: power of 10 |
| `round10` | `(value, exp?): number` | `decimalAdjust('round', ...)` |
| `floor10` | `(value, exp?): number` | `decimalAdjust('floor', ...)` |
| `ceil10` | `(value, exp?): number` | `decimalAdjust('ceil', ...)` |
| `calcProgress` | `(value, total): number` | Progress ratio `[0, 1]`, rounded to 2 decimal places. **Throws** if `total === 0` or not a valid number |

### Guards — boolean

| Export | Signature | Notes |
|--------|-----------|-------|
| `isBoolean` | `(val): val is boolean` | `typeof === 'boolean'` only. `0`, `1`, `'true'` → `false` |
| `toBoolean` | `(val): boolean` | `null`/`undefined` → `false`; numbers: `> 0` → `true`; strings: `'true'`/`'yes'`/`'false'`/`'no'` (case-insensitive) |

### Guards — symbol

| Export | Signature |
|--------|-----------|
| `isSymbol` | `(val): val is symbol` |

### Guards — object

| Export | Signature | Notes |
|--------|-----------|-------|
| `isPlainObject<T>` | `(val): val is T` | Prototype must be `Object.prototype` or `null`. Excludes `Array`, `Date`, `Map`, `Set`, `Error`, etc. |
| `isInferObject<T>` | `(obj, guard?): obj is T` | `typeof === 'object'` + non-null + non-array. Looser than `isPlainObject` — accepts `Date`, `Map`, etc. Optional `guard: (it: T) => boolean` for extra assertions |
| `isDate` | `(val): val is Date` | `instanceof Date`. Does **not** check for Invalid Date |
| `isRegExp` | `(val): val is RegExp` | `instanceof RegExp` |

### Guards — function

| Export | Signature | Notes |
|--------|-----------|-------|
| `isConstructor<T>` | `(val): val is Constructor<T>` | Has `prototype` — excludes arrow functions |
| `isFunction<T>` | `(val): val is T` | Any callable including arrow functions |
| `isPromise<T>` | `(val): val is Promise<T>` | `instanceof Promise` OR has both `then` + `catch` methods. **Note**: checks TS `Promise` interface, not Promise/A+ thenable (A+ only requires `then`) |

### Guards — error

| Export | Signature | Notes |
|--------|-----------|-------|
| `isErrorLike` | `(err): err is ErrorLike` | Object with non-empty `message` or `error` field (OR semantics) |
| `errorMessage` | `(err): string` | Extracts message string from any value. Priority: string → `Error.message` → `ErrorLike.message` → `ErrorLike.error` → `''` |

### Guards — existence

| Export | Signature |
|--------|-----------|
| `isNull` | `(val): val is null` |
| `isUndefined` | `(val): val is undefined` |
| `isNil` | `(val): val is null \| undefined` |
| `isPresent<T>` | `(val: T \| null \| undefined): val is T` |

### Guards — array

| Export | Signature | Notes |
|--------|-----------|-------|
| `isArray<T>` | `(val): val is T[]` | `Array.isArray` |
| `notEmptyArray<T>` | `(val, guard?): val is T[]` | Non-empty array; if `guard` provided, all elements must pass |
| `arrayGuard<T>` | `(guard): TypeGuard<T[]>` | Curried. **Caution**: empty array `[]` returns `true` (universal quantification over empty set). If non-empty is required, combine with `and` |

### Guards — combinators

| Export | Signature | Notes |
|--------|-----------|-------|
| `and<T>` | `(...guards): TypeGuard<T>` | All guards must pass, short-circuit on first failure. First guard must be `TypeGuard<T>`, rest are `(val: T) => boolean` |
| `or<G>` | `(...guards): TypeGuard<...>` | Any guard passes, short-circuit. Return type is union of all guard types |
| `not` | `(guard): (val) => boolean` | **Does NOT narrow types** — TypeScript has no negated types. The returned function is `(val: unknown) => boolean`, not a `TypeGuard` |

---

## `@meld-ts/core/timer`

Prefix-isolated timer management. `createTimer` is the universal entry point — mode selects the underlying implementation.

### Types

| Export | Description |
|--------|-------------|
| `TimerHandle` | Interface: `set(key, callback, ms): () => void` / `clear(key)` / `clearAll()` |
| `TimerMode` | `'timeout' \| 'interval' \| TimerCustomMode` |
| `TimerCustomMode<Id>` | `{ set: (fn, ms) => Id; clear: (id: Id) => void }` — bring-your-own timer implementation |
| `TimerOptions<Mode>` | `{ prefix?, mode?, onError?, [key: string]: unknown }` |

### Functions

| Export | Signature | Notes |
|--------|-----------|-------|
| `createTimer(prefixOrOptions?, mode?)` | Returns `TimerHandle` | Default mode: `'timeout'` (setTimeout). Same key = cancels previous before registering new |
| `createTicker(prefixOrOptions?)` | Returns `TimerHandle` | Convenience wrapper for `createTimer(opts, 'interval')` |

`set()` returns an unsubscribe function — no need to store the key to cancel:

```ts
// string prefix, default timeout mode
const t = createTimer('api');
const stop = t.set('poll', () => fetch('/status'), 5000);
stop(); // or t.clear('poll')

// options object with onError
const t2 = createTimer({ prefix: 'ws', onError: console.warn });

// interval mode
const ticker = createTimer('hb', 'interval');
// or equivalently:
const ticker2 = createTicker('hb');

// custom mode — bring your own set/clear
const rafTimer = createTimer('raf', {
  set: (fn, _ms) => requestAnimationFrame(fn),
  clear: (id) => cancelAnimationFrame(id),
});
```

---

## `@meld-ts/core/singleton`

| Export | Description |
|--------|-------------|
| `singleton(factory)` | Wraps factory. First call executes it, subsequent calls return cached result. Async factories handle concurrent calls — only one Promise in-flight |

```ts
const getClient = singleton(async () => new ApiClient().connect());
const [a, b] = await Promise.all([getClient(), getClient()]); // a === b
```

---

## `@meld-ts/core/path`

| Export | Description |
|--------|-------------|
| `UnixDS` | `'/'` |
| `WinDS` | `'\\'` |
| `DirectorySeparator` | `'/' \| '\\'` |
| `PathInput` | `string \| undefined \| null` |
| `PathReplacementCallback` | `(path: string, separator: string) => string` |
| `PathUtilsOptions` | `{ separator, dangerReplace?, duplicateReplace? }` |
| `createPathUtils(options)` | Returns `{ purge, join }` |

**`dangerReplace` call contract**: called **once per top-level argument** to `join()`.
After internal splitting on the separator, sub-segments do NOT re-invoke `dangerReplace`.
Passing a complex path as one argument gives the callback full context:

```ts
join(`${userInput}/sub/path`, 'fixed'); // dangerReplace sees "userInput/sub/path" and "fixed" separately
```

`join()` supports `.` (skip) and `..` (pop previous segment). Excess `..` beyond the root are preserved as-is.

---

## `@meld-ts/core/traits`

### `implTraits`

| Export | Description |
|--------|-------------|
| `implTraits(ctor, ...traits)` | Copies property descriptors (including Symbols and getters/setters) from each trait object onto `ctor.prototype`. Skips `constructor` |

Requires declaration merging for TypeScript to accept the mixed-in methods:

```ts
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class MyClass { name = 'test' }

implTraits(MyClass, { greet() { return `hello ${this.name}` } })

// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface MyClass extends GreetTrait {}
```

### `configurable`

| Export | Description |
|--------|-------------|
| `configurable<T>(presets)` | Two-layer config: `presets` (cloned at init) + `users` (overrides). Returns `Configurable<T>` |
| `Configurable<T>` | Interface: `get(key)` / `set(key, value)` / `has(key)` / `getAll()` / `setAll(data)` / `reset()` |

`get` priority: user value → preset. `has` returns true if key exists in either layer. `reset` clears all user values.

### `createDebuggableTrait`

| Export | Description |
|--------|-------------|
| `createDebuggableTrait<Settings>(config)` | Returns `DebuggableTrait<Settings>` object for use with `implTraits` |
| `DebuggableTrait<Settings>` | Interface: `setDebug()` / `shouldDebug(scope)` / `debug(scope, ...args)` / `getStack(skipFrames?)` |
| `DebugConfiguration` | Config interface: `name`, `color`, `style`, `scopeColor`, `scopeStyle`, `method`, `timeFlag`, `format` |
| `DebugSettings` | Runtime settings interface: `debug?: boolean; [key: string]: unknown` |
| `debugTimeFlag(date?)` | Returns `'HH:MM:SS.mmm'` timestamp string |
| `DebugFunction` | `(...args: unknown[]) => void` |
| `TimeFlagFunction` | `(date?: Date \| null) => string` |

`shouldDebug` priority: `settings[scope]` → `settings[namespace]` (before first `.`) → `settings.debug`.

**Security note**: `color`, `scopeColor`, `style`, `scopeStyle` are interpolated directly into `%c` console format strings without escaping. Ensure values come from trusted sources.

---

## `@meld-ts/core/events`

### Types and interfaces

| Export | Description |
|--------|-------------|
| `EventsDefinition` | `Record<PropertyKey, any>` — base event map type |
| `MaybePromise<T>` | `T \| Promise<T>` |
| `EventUnsubscribeFn` | `() => void` — returned by `on()` |
| `EventCallbackFn<T>` | `(params: T) => MaybePromise<void>` |
| `MarkedCallback<T>` | `{ fn: EventCallbackFn<T>; once: boolean }` |
| `EventCallbackDeclaration<T>` | Single callback, marked callback, or array of either |
| `EventsCallbacks<E>` | `Partial<{ [K in keyof E]: EventCallbackDeclaration<E[K]> }>` |
| `EventsEmitter<E>` | Interface: `on` / `once` / `off` / `emit` |
| `EventsEmitterOptions<E>` | `{ onError?: (err, name) => void; [key: string]: unknown }` |
| `EventsDelegator<E>` | Interface: `inject(emitter?)` / `eject()` |
| `EventsInput<E>` | `EventsEmitter<E> \| EventsCallbacks<E> \| EventsDelegator<E>` |
| `LinkEventMode` | `'on' \| 'once' \| 'off'` |

### Functions

| Export | Signature | Notes |
|--------|-----------|-------|
| `once<T>(fn)` | `(fn) => MarkedCallback<T>` | Marks a callback for one-time execution in `EventsCallbacks` declarations |
| `isEventsEmitter<E>(obj)` | type guard | Duck-type: checks `emit`, `on`, `once`, `off` |
| `isEventsDelegator<E>(obj)` | type guard | Duck-type: checks `inject`, `eject` |
| `createEmitter<E>(options?)` | Returns `EventsEmitter<E>` | All listeners run concurrently via `Promise.all` |
| `linkEvents(emitter, input, mode?)` | Returns `emitter` | Attaches/detaches `EventsCallbacks` or `EventsDelegator`. `mode` defaults to `'on'` |
| `initEventsEmitter(input, createOrOptions?, options?)` | Returns `EventsEmitter<E>` | Smart init: null → create new; existing emitter → return as-is; callbacks/delegator → create + attach |
| `createDelegator<E>(callbacks)` | Returns `EventsDelegator<E>` | Wraps a callbacks object. `inject(emitter)` registers all; `eject()` unregisters all without needing the emitter reference |

### Design contract

**`emit` never throws.** Listener errors are silently routed to `options.onError`. No `.catch()` needed at call sites.

**Events are notifications, not interceptors.** Never branch logic on `await emitter.emit(...)` results — emit is fire-and-forget.

`EventsEmitterOptions` has `[key: string]: unknown` intentionally — allows custom factory functions to accept extended options without TypeScript errors.

---

## `@meld-ts/core/async`

### Error classes

| Export | Fields | Thrown by |
|--------|--------|-----------|
| `TimeoutError` | `ms: number`, `data?: unknown` | `timeout()` wrapper, `StatefulRpc` internal timeout |
| `RpcAbortError` | `reason?: unknown` | `StatefulRpc.abort()`, `StatefulRpc.clear()` |
| `RetryExhaustedError` | `attempt: number`, `error: unknown`, `options: RetryOptions` | `retry()` / `retryFn()` after max attempts |
| `PendingScopeConflictError` | `scope: string` | `pending()` / `pendingFn()` when same static scope is registered twice |

### Types

| Export | Description |
|--------|-------------|
| `RetryOptions` | `{ attempts?, delay?, onRetry? }` |
| `RetryFnParams` | `{ attempt: number, error: unknown, options: RetryOptions }` |
| `RetryCallbackFn<T, Args>` | Callback type for `retryFn` — first param is `RetryFnParams` |
| `PendingFnParams` | `{ scope: string, getPendingCount: () => number }` |
| `PendingCallbackFn<T, Args>` | Callback type for `pendingFn` — first param is `PendingFnParams` |
| `PendingHandle` | Interface returned by `createPending()`: `{ pending, pendingFn, clear }` |
| `StatefulRpcEvents<Result, Params>` | `{ pending, resolve, reject, settle }` event map |
| `StatefulRpcOptions<Result, Params>` | `{ idPrefix?, timeout?, events? }` |
| `StatefulRpcTask<Params>` | Frozen: `key`, `taskId`, `params`, `date` |
| `StatefulRpcSettled<Result>` | `{ key, type: 'resolve' \| 'reject', result }` |

### Functions

| Export | Signature | Notes |
|--------|-----------|-------|
| `createPending()` | Returns `PendingHandle` | Creates an isolated pending instance with its own scope registry. **Preferred** for HMR / hot-reload environments — module re-evaluation creates a fresh instance, no conflicts |
| `clearPendingRegistry()` | `() => void` | Clears the **global** scope registry. **Required in test `afterEach`** to avoid `PendingScopeConflictError` between test cases |
| `pending(scope, fn)` | Returns deduped function | Global instance. Same scope + same key → shared in-flight Promise. Static scope must be globally unique — duplicate registration throws |
| `pendingFn(scope, fn)` | Returns deduped function | Global instance. Like `pending` but `fn` receives `PendingFnParams` as first argument (scope, getPendingCount) |
| `retry(fn, options?)` | `(fn, opts) => wrapped fn` | Transparent wrapper — returned function has same signature. Default: 3 attempts, 100ms delay |
| `retryFn(fn, options?)` | `(fn, opts) => wrapped fn` | Like `retry` but `fn` receives `RetryFnParams` as first argument — enables fallback URLs, exponential backoff logic, etc. |
| `timeout(fn, ms)` | `(fn, ms) => wrapped fn` | Race between `fn` execution and `TimeoutError` |
| `sleep(ms)` | `Promise<void>` | Simple delay |
| `sleep(ms, fn)` | `Promise<Awaited<ReturnType<F>>>` | Delay then execute |

**Global vs isolated instance:**

```ts
// Global instance — static scope must be unique across the entire app
// Tests must call clearPendingRegistry() in afterEach
const fetchConfig = pending('config', () => fetch('/api/config').then(r => r.json()));

// Isolated instance — preferred for HMR / hot-reload environments
// Module re-evaluation creates a fresh instance; no cleanup needed
const { pending: localPending } = createPending();
const fetchUser = localPending(
  (id: string) => `user:${id}`,
  (id: string) => fetch(`/api/user/${id}`).then(r => r.json()),
);
```

### `StatefulRpc<Result, Params>`

Stateful RPC pending registry. Same `key` = multiple concurrent callers share one settle.

```ts
const rpc = new StatefulRpc<UserProfile, { userId: string }>({
  idPrefix: 'user-rpc',   // optional, affects taskId prefix
  timeout: 10_000,        // default 30000
  events: {
    pending: ({ task }) => console.log('pending', task.key),
    resolve: ({ task, result }) => cache.set(task.key, result),
    reject:  ({ task, result }) => console.error(task.key, result),
    settle:  ({ key, type })   => metrics.record(key, type),
  },
});

const p1 = rpc.pending('user:42', { userId: '42' });
const p2 = rpc.pending('user:42', { userId: '42' }); // joins same group

rpc.resolve('user:42', profile); // p1 and p2 both settle
```

**Methods**:

| Method | Description |
|--------|-------------|
| `pending(key, params, timeout?)` | Returns `Promise<Result>`. Multiple concurrent calls with same key share one settle |
| `resolve(key, result)` | Resolves all pending tasks for `key`. Returns `this` |
| `reject(key, error)` | Rejects all pending tasks for `key`. Returns `this` |
| `abort(key, reason?)` | Rejects with `RpcAbortError`. Returns `this` |
| `clear(reason?)` | Aborts all keys. Returns `this` |
| `settle(settled)` | Core settle method. Accepts `StatefulRpcSettled<Result>` |
| `getPendingCount(key?)` | Count of pending tasks, optionally for a specific key |

**`taskId` format**: `{instanceId}_{key}_{counter}` — globally unique across instances.

**settle contract**: resolve/reject happens first (deliver result ASAP), then events fire as notifications. Event handlers must not assume the Promise is still pending.

**Timeout behavior**: when any task times out, the entire key is rejected with `TimeoutError`, including tasks that haven't timed out yet. Override `protected onTimeout` to customize.
