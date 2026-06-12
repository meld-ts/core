# Code Review — @meld-ts/core

**Reviewer**: 知薇@AI-SOUL  
**Date**: 2026-06-13  
**Scope**: `src/` 全量审查（guards / base / async / events / traits / timer / singleton / path）

---

## 概述

整体代码质量较高：类型系统严谨，文档详细，测试覆盖到位。发现 **2 个 Bug**、**4 个设计隐患**、**3 个次要问题**，按严重程度排列如下。

---

## BUG（必须修复）

### BUG-01 · `configurable.ts:66–68` — `has()` 实现与文档相悖

**文件**: `src/traits/configurable.ts`  
**严重程度**: 高

```ts
// 文档说：检查 key 是否已被用户显式设置（仅查 users 层，不查 presets）
has: <K extends keyof T>(key: K): boolean =>
  Object.hasOwn(users, key) ||
  Object.hasOwn(_presets as object, key as string),  // ← 明确查了 presets
```

**问题**：文档承诺"仅查 users 层"，实现却同时查 presets。使用者若依赖 `has()` 区分"用户显式设置"与"只来自预设"，会得到错误结果：

```ts
const cfg = configurable({ timeout: 3000 });
cfg.has('timeout'); // 期望 false（用户未设置）→ 实际返回 true（presets 里有）
```

**修复**：

```ts
// 选项 A：修复实现，只查 users 层（符合文档语义）
has: <K extends keyof T>(key: K): boolean =>
  Object.hasOwn(users, key),

// 选项 B：修改文档，说明 has() 同时检查两层（改变 API 语义，慎重）
```

---

### BUG-02 · `retry.ts:244–247` — `sleep(ms, fn)` 同步抛出导致 Promise 永远挂起

**文件**: `src/async/retry.ts`  
**严重程度**: 中

```ts
export function sleep(ms: number, fn?: AnyFunction): Promise<unknown> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(fn ? fn() : undefined), ms),
    //                              ↑ fn() 在 setTimeout 回调里调用
    //                              如果 fn 同步抛出：
    //                              1. resolve 永远不执行 → Promise 永远挂起
    //                              2. 未捕获异常抛到全局事件循环
  );
}
```

**触发场景**：

```ts
await sleep(100, () => { throw new Error('boom'); });
// Promise 永远 pending，同时全局报 uncaught exception
```

Promise constructor 的 executor 只捕获 executor 函数自身的异常，**不能**捕获 setTimeout 回调里的异常。

**修复**：

```ts
export function sleep(ms: number, fn?: AnyFunction): Promise<unknown> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      if (!fn) return resolve(undefined);
      try {
        resolve(fn());
      } catch (err) {
        reject(err);
      }
    }, ms),
  );
}
```

---

## 设计隐患（强烈建议修复）

### ISSUE-01 · `StatefulRpc.ts` — `settle()` 未 await `emit()`，事件错误静默丢失

**文件**: `src/async/StatefulRpc.ts:225–238`  
**严重程度**: 中

```ts
settle(settled: StatefulRpcSettled<Result>): this {
  const items = [...map.values()];
  for (const it of items) {
    this.removePendingItem(it);
    this.#emitter.emit(settled.type, { ... });   // ← 未 await
    this.#emitter.emit('settle', { ... });       // ← 未 await
    if (settled.type === 'resolve') {
      it.resolve(settled.result);  // ← pending Promise 在事件处理完成前已 resolve
    } else {
      it.reject(settled.result);
    }
  }
  return this;
}
```

**两个后果**：

1. 事件处理函数（`events.resolve` / `events.reject` / `events.settle`）如果抛出异常，会产生 **unhandled Promise rejection**，无任何上下文信息。
2. 用户的 pending Promise **在事件处理函数执行完成之前**就被 resolve/reject，导致事件顺序不可预期。

这不是孤立问题——`StatefulRpc` 的使用者很可能在事件回调中做日志或清理，期望这些操作先于 pending 方的 `.then()` 执行。

**修复方向**：如需保持同步 `settle` 签名（返回 `this`），可在事件回调抛出时记录到 `console.error` 兜底；如可改成异步，则 `await emit()`。

---

### ISSUE-02 · `StatefulRpc.ts` — 内部方法标 `@internal` 却是公开可访问的

**文件**: `src/async/StatefulRpc.ts:138–191`

```ts
/** @internal */
newPendingItem(...) { ... }    // public
/** @internal */
addPendingItem(...) { ... }    // public
/** @internal */
removePendingItem(...) { ... } // public
```

`@internal` 是文档约定，不是运行时保护。外部代码（包括子类以外的任意模块）可直接调用这三个方法，绕过正常的 pending/settle 流程，导致定时器和 Map 状态不一致。

**修复**：改为 `protected`，与 `onTimeout` 保持一致。

```ts
protected newPendingItem(...) { ... }
protected addPendingItem(...) { ... }
protected removePendingItem(...) { ... }
```

---

### ISSUE-03 · `events/index.ts` — `once()` 注册的监听器无法通过 `off(name, originalCallback)` 移除

**文件**: `src/events/index.ts:177–184`

```ts
const once = <N extends keyof E>(name: N, callback: EventCallbackFn<E[N]>) => {
  const off = on(name, ((params: E[N]) => {
    off();           // 注册的是 wrapper，不是 callback 本身
    return callback(params);
  }) as EventCallbackFn<E[N]>);
  return off;
};
```

`on()` 注册的是 wrapper，而 `off(name, originalCallback)` 试图移除 `originalCallback`，但 listener set 里存的是 wrapper，**移除无效，监听器继续存在**。

这一行为在文档和注释里均未提及，容易造成内存泄漏或"已卸载的组件仍收到事件"类型的 bug。

**建议**：在 `EventsEmitter` 接口和 `createEmitter` 文档中明确说明：`once()` 注册的监听器**只能**通过返回的 `off` 函数移除，不支持 `emitter.off(name, originalCallback)`。

---

### ISSUE-04 · `singleton.ts` — 异步工厂失败后 `isAsync` 标志不重置

**文件**: `src/singleton.ts:41–68`  
**严重程度**: 低（在实际 TypeScript 使用中罕见触发）

```ts
let isAsync = false;

return (...args) => {
  if (ready) {
    return isAsync ? Promise.resolve(instance) : instance;  // isAsync 永不被重置
  }
  if (inflight != null) return inflight;

  const result = factory(...args);

  if (result instanceof Promise) {
    isAsync = true;        // 设置后永远是 true
    inflight = result.then(...).finally(() => { inflight = undefined; });
    return inflight;
  }

  instance = result;
  ready = true;
  return instance;
};
```

**边界场景**：若某工厂函数第一次调用返回 Promise（失败），之后再次调用返回同步值（成功），`isAsync` 仍为 `true`，`ready` 变为 `true`，下次调用走 `Promise.resolve(instance)` 而不是直接返回 `instance`。

TypeScript 重载约束下工厂函数不会混用同步/异步返回值，但运行时 `any` 绕过时会触发。可加一行 `isAsync = result instanceof Promise;` 在每次真正执行时更新。

---

## 次要问题

### MINOR-01 · `cloneObjectByJson` 静默降级为浅拷贝，调用方无感知

**文件**: `src/base/cloneObject.ts:22–29`

```ts
export const cloneObjectByJson = <T extends object>(obj: T): T => {
  _assertObject(obj);
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return cloneObjectByAssign(obj);  // 静默降级为浅拷贝
  }
};
```

循环引用对象用 `cloneObjectByJson` 时得到浅拷贝，不会报错。调用方若依赖深拷贝语义，可能遭遇引用共享的 bug，且排查困难。

**建议**：至少在降级时打印 `console.warn` 警告，或在文档中用更醒目的方式标注这一行为。

---

### MINOR-02 · `timer.ts` — `set(key, callback, ms)` 未校验 `ms`

**文件**: `src/timer.ts:57–63`

`ms` 为 `NaN` 或负数时，`setTimeout`/`setInterval` 会将其当作 0 处理；`Infinity` 在部分环境下行为不一致。对于 `createTicker`，`ms` 为 0 会使回调以最高频率执行，对性能有较大影响。

**建议**：添加参数校验：`if (!Number.isFinite(ms) || ms < 0) throw new RangeError(...)`

---

### MINOR-03 · `debuggable.ts` — CSS 注入风险

**文件**: `src/traits/debuggable.ts:44–56`

文档已注明 `color` / `style` / `scopeStyle` 直接拼入 `%c` 格式字符串。若这些值来自外部输入（如用户配置文件、URL 参数），在浏览器控制台可注入任意 CSS（如 `background: url(...)` 或 `content`）。

当前文档说"请确保来源可信"，但并未标注这是安全边界。**建议**在 `DebugConfiguration` 接口文档中加入安全提示标签（如 `@security`），并在公共 API 文档中明确指出这一限制。

---

## 无问题确认

以下模块审查未发现问题：

| 模块 | 说明 |
|------|------|
| `guards/*` | 所有类型守卫实现正确，`arrayGuard` 空数组行为已在文档中说明 |
| `guards/logicality.ts` (`and`/`or`/`not`) | 短路逻辑正确，`not` 返回非 TypeGuard 已有文档说明 |
| `events/index.ts` (`emit` 并发执行) | 快照迭代（`[...set]`）避免了迭代中修改的问题 |
| `events/index.ts` (`createDelegator`) | `inject` 前正确先清除旧监听器，防止重复注册 |
| `StatefulRpc.ts` (`settle` 迭代) | 正确使用 `[...map.values()]` 快照 |
| `pending.ts` 同步抛出处理 | executor 内的同步抛出正确被 Promise 捕获 |
| `retry.ts` 递归深度 | `await sleep()` 在递归前已异步切出，实际调用栈深度为 1 |
| `path.ts` `join` / `purge` 基本逻辑 | `..` 回溯和分隔符处理逻辑正确 |
| `implTraits.ts` | Symbol 键复制、`constructor` 跳过均正确处理 |

---

## 优先级汇总

| ID | 位置 | 类型 | 优先级 |
|----|------|------|--------|
| BUG-01 | `traits/configurable.ts:66` | Bug | P0 — 立即修复 |
| BUG-02 | `async/retry.ts:244` | Bug | P1 — 近期修复 |
| ISSUE-01 | `async/StatefulRpc.ts:225` | 设计隐患 | P1 — 近期修复 |
| ISSUE-02 | `async/StatefulRpc.ts:138` | 可见性 | P2 |
| ISSUE-03 | `events/index.ts:177` | 文档缺失 | P2 |
| ISSUE-04 | `singleton.ts:41` | 边界情况 | P3 |
| MINOR-01 | `base/cloneObject.ts:24` | 静默降级 | P3 |
| MINOR-02 | `timer.ts:57` | 参数校验 | P3 |
| MINOR-03 | `traits/debuggable.ts:44` | 安全提示 | P3 |
