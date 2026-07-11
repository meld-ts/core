# KAI 审查 — 2026-07-11

审查人：KAI@AI-SOUL
范围：`src/` 全量 + 构建配置 + CI + 文档 + 已有审查记录
前置审查：Codex（2026-07-11）、思源（2026-06-13）、知薇、文文、KAI（2026-06-12）

---

## 概述

414 测试全通过，100% 覆盖率。项目整体质量很高——类型推断精准、架构简洁不过度抽象。本轮审查重点在于发现已有审查（包括今天的 Codex 审查）遗漏的运行时缺陷。所有问题按严重程度排列：🔴 高 > 🟡 中 > 🟢 低。

---

## 🔴 高优先级

### H1 · `timeout` 延迟 reject 产生未捕获 rejection

**文件**：`src/async/retry.ts` — `timeout` 函数

```ts
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
```

**问题**：当 timeout 先赢（race settle 为 TimeoutError），而 fn 随后 reject 时，fnPromise 的 rejection **无人监听**——`Promise.race` 已经 settle，不再关心另一个 promise。这会产生 **unhandled rejection**，在 `--unhandled-rejections=throw` 模式下直接崩进程。

现有测试只覆盖了 fn 在超时后 **resolve** 的情况（`Bun.sleep(100)` + `return 'done'`），没有覆盖 fn 在超时后 **reject** 的情况。

**修复**：

```ts
const fnPromise = Promise.resolve(fn(...args)).finally(() => clearTimeout(timerId));
fnPromise.catch(() => {}); // 吞掉 timeout 赢之后的延迟 reject
return Promise.race([
  fnPromise,
  new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(ms)), ms);
  }),
]);
```

`fnPromise.catch(() => {})` 不会影响 race 行为——如果 fn 在 timeout 之前 reject，race 照样拿到 rejection；只是 timeout 赢之后的延迟 reject 被静默吞掉。

---

### H2 · `retry` 的 options 未冻结，与 `retryFn` 不一致

**文件**：`src/async/retry.ts`

```ts
// retry — options 原样传入，未冻结
export const retry = <F extends AnyFunction>(
  fn: F,
  options: RetryOptions = {},
): ... => {
  return (...args) =>
    executeWithRetry((_attempt, _error) => fn(...args), options); // ← 原始引用
};

// retryFn — options 冻结了
export const retryFn = <T, Args extends unknown[]>(
  fn: RetryCallbackFn<T, Args>,
  options: RetryOptions = {},
): ... => {
  const frozenOptions = Object.freeze({ ...options }); // ← 冻结副本
  return (...args) =>
    executeWithRetry(
      (attempt, error) => fn({ attempt, error, options: frozenOptions }, ...args),
      options,  // ← 注意：executeWithRetry 收到的是原始 options，不是 frozenOptions
    );
};
```

两个问题：

1. **`retry` 的 options 可变**——调用方在创建 wrapper 后修改 options 对象，行为会跟着变。`retryFn` 已冻结，但 `retry` 没有。
2. **`retryFn` 的冻结不彻底**——`frozenOptions` 只传给了 fn 的 `RetryFnParams.options`，但 `executeWithRetry` 收到的仍然是**原始未冻结的 `options`**。这意味着 `RetryExhaustedError` 里存的 `this.options`（来自 `executeWithRetry` 内部的 `params.options`）是原始可变对象，而不是冻结副本。

**修复建议**：`retry` 也应冻结 options，`retryFn` 应将 `frozenOptions` 传给 `executeWithRetry`。

---

## 🟡 中优先级

### M1 · `configurable.getAll()` — 浅拷贝导致嵌套对象可被外部篡改

**文件**：`src/traits/configurable.ts`

```ts
getAll: (): T => ({ ..._presets, ...users }) as T,
```

`getAll()` 返回浅合并的对象。嵌套对象/数组与 `_presets` 内部共享引用：

```ts
const cfg = configurable({ nested: { value: 1 } });
cfg.getAll().nested.value = 999;
cfg.get('nested'); // { value: 999 } — presets 被污染了！
cfg.reset();
cfg.get('nested'); // { value: 999 } — reset 也救不回来
```

`_presets` 在初始化时通过 `cloneObject` 深拷贝了，但 `getAll()` 的浅展开破坏了这层隔离。

**修复建议**：`getAll()` 返回时也做一次深拷贝，或者在 JSDoc 中明确警告返回值是浅拷贝、嵌套对象不可变。

---

### M2 · `cloneObjectByJson` — 库代码中的 `console.warn`

**文件**：`src/base/cloneObject.ts`

```ts
catch {
  console.warn(
    'cloneObjectByJson: JSON.stringify failed, falling back to shallow copy',
  );
  return Array.isArray(obj) ? ([...obj] as unknown as T) : cloneObjectByAssign(obj);
}
```

库代码直接调 `console.warn` 污染调用方控制台，且无法被抑制或重定向。对于一个零依赖工具库，这不够克制。

**修复建议**：移除 `console.warn`，改为静默降级。如果需要通知调用方，接受可选的 `onWarn` 回调。

---

### M3 · `linkEvents` — `'once'` 模式对 delegator 静默失效

**文件**：`src/events/index.ts`

```ts
export const linkEvents = <E extends EventsDefinition = EventsDefinition>(
  emitter: EventsEmitter<E>,
  input: EventsCallbacks<E> | EventsDelegator<E>,
  mode: LinkEventMode = 'on',
): EventsEmitter<E> => {
  if (isEventsDelegator(input)) {
    mode === 'off' ? input.eject() : input.inject(emitter);
    // ↑ 'once' 走了 inject 分支，但 inject 不知道 'once' 语义
    return emitter;
  }
  // ...
};
```

当 `mode === 'once'` 且 `input` 是 `EventsDelegator` 时，`inject` 按正常方式注册所有回调，**`once` 语义被丢弃**。`createDelegator` 的 `inject` 不接受 `once` 参数。

调用方传 `linkEvents(emitter, delegator, 'once')` 会以为回调只触发一次，实际会持续触发。

**修复建议**：要么在 `linkEvents` 中对 delegator + `'once'` 抛出明确错误，要么让 `inject` 接受 `once` 参数。

---

### M4 · `check.sh` — 失败时不等待并行进程，可能产生僵尸

**文件**：`.lefthook/pre-push/check.sh`

```sh
#!/bin/sh
set -e
bun run lint &
LINT_PID=$!
bun run ts-check &
TSC_PID=$!
wait $LINT_PID && wait $TSC_PID
```

`wait $LINT_PID && wait $TSC_PID` — 如果 lint 失败，`&&` 短路，`wait $TSC_PID` 不执行，但 `ts-check` 进程仍在后台运行。`set -e` 在 `&&` 链中不触发（POSIX shell 语义），但整体退出码为 lint 的失败码，脚本退出。此时 `ts-check` 变成孤儿进程。

**修复建议**：

```sh
wait $LINT_PID; LINT_EXIT=$?
wait $TSC_PID; TSC_EXIT=$?
[ $LINT_EXIT -eq 0 ] && [ $TSC_EXIT -eq 0 ]
```

---

### M5 · 缺少 `AbortSignal` 支持

`retry` 和 `timeout` 都不支持 `AbortSignal`——现代 Web API 的标准取消机制。这意味着：

- `retry` 无法被外部取消（如用户导航离开、组件卸载）
- `timeout` 赢了之后 fn 仍在后台执行（无法取消 `fetch` 等原生操作）
- `StatefulRpc` 用自己的 timer 机制做取消，与 `AbortController` 生态不互通

对于面向浏览器和 Node.js 双平台的工具库，`AbortSignal` 已经是标配。建议在下一版本中考虑集成。

---

## 🟢 低优先级

| # | 位置 | 描述 |
|---|------|------|
| 1 | `guards/number.ts` `isNumber` | `!Number.isNaN(val)` 冗余——`Number.isFinite(val)` 已排除 NaN |
| 2 | `guards/boolean.ts` `toBoolean` | `toBoolean('0')` 返回 `true`（`Boolean('0')` 语义），但多数用户期望 `false`。建议在 JSDoc 明确说明或增加 `'0'` 特判 |
| 3 | `bunup.browser.ts` | 两个 browser 构建配置都设 `clean: false`，删除源文件后构建产物会残留 |
| 4 | 项目根目录 | 缺少 `CHANGELOG.md`——已发布的 npm 包没有变更日志 |
| 5 | `.github/workflows/pr-check.yml` | 无 Bun 缓存，每次 CI 都从头安装依赖 |
| 6 | `guards/number.ts` `calcProgress` | 分母严格校验（throw），分子静默返回 0——不对称行为已在 JSDoc 说明，但可考虑提供 `calcProgressSafe` 静默版本 |

---

## 与 Codex 审查的对比

今天的 Codex 审查覆盖了 H1（CLAUDE.md AggregateError 文档不符）、H2（path 默认无安全策略）、M2（isPromise 过严）、M3（timer Record 原型链风险）等问题。这些问题确实存在，但 Codex **遗漏了最关键的 `timeout` 未捕获 rejection bug**——这是唯一能导致进程崩溃的运行时缺陷。

此外，`retry` options 冻结不一致、`configurable.getAll()` 浅拷贝泄露、`linkEvents` once 对 delegator 静默失效，也都是 Codex 未发现的实际问题。

---

## 总体评价

| 维度 | 评分 | 评价 |
|------|------|------|
| 类型系统设计 | ⭐⭐⭐⭐⭐ | 泛型推断精准，条件类型设计精巧 |
| 测试质量 | ⭐⭐⭐⭐⭐ | 100% 覆盖率，边界场景极为全面 |
| 代码可读性 | ⭐⭐⭐⭐ | 注释质量高，部分实现可更清晰 |
| 架构设计 | ⭐⭐⭐⭐ | 模块拆分合理，"不过度抽象"原则好 |
| 构建/CI | ⭐⭐⭐⭐⭐ | 完善的 CI 门禁，双平台构建 |
| 文档 | ⭐⭐⭐⭐ | TypeDoc + README 完善，CLAUDE.md 有一处不一致（Codex 已指出） |
| 安全性 | ⭐⭐⭐ | path 默认不安全（Codex 已指出），timeout 有 unhandled rejection |

**综合评价**：最需要立即修复的是 **H1（`timeout` 的未捕获 rejection）**，其次是 **H2（`retry` 的 options 冻结一致性）**。其余中低优先级问题可以排入后续迭代。
