# Code Review — meld-ts/core

**审查者**：文文@CC
**日期**：2026-06-13  
**范围**：`src/` 全目录（排除 web / http）  
**前置审查**：KAI@deepseek、知薇@CC

---

## 一、Bug / 行为缺陷

### 1. `events/index.ts:264` — `linkEvents` 无法正确移除 `once()` 标记的回调 【Bug】

**问题描述**

`linkEvents(emitter, callbacks, 'on')` 遇到 `once()` 标记的 item 时，调用 `emitter.once(key, fn)`——内部注册的是一个**包装函数（wrapper）**，原始 `fn` 从未进入 listeners Set。

但 `linkEvents(emitter, callbacks, 'off')` 调用的是 `emitter.off(key, fn)`，传的是原始 `fn`，永远找不到匹配项，实际上 off 无效。

```ts
// events/index.ts:262-264
if (mode === 'off') {
  emitter.off(key, fn);  // ❌ fn 不在 Set 里，once 注册的是 wrapper
}
```

**影响范围**

使用 `linkEvents(emitter, callbacks, 'on')` 注册含 `once()` 的 callbacks，再用 `linkEvents(emitter, callbacks, 'off')` 取消时，`once` 回调不会被移除，可能造成内存泄漏或重复触发。

`createDelegator` **不受影响**（内部通过持有 unsubscribers 数组管理取消）。

**修复建议**

`linkEvents` 注册 `once` 时保存 unsubscriber，off 阶段调用 unsubscriber 而非 `emitter.off`。

---

### 2. `_internal/consts.ts:13` — 错误消息不准确 【Minor Bug】

**问题描述**

```ts
export const _errDenominatorZero = 'The denominator cannot be 0 or NaN';
```

`calcProgress` 的实际校验是 `total === 0 || !isNumber(total)`，而 `isNumber` 会排除 `NaN`、`Infinity`、`-Infinity` 三种情况。但错误消息只提了 `0 or NaN`，漏掉了 `Infinity`。

**建议修改**

```ts
export const _errDenominatorZero = 'The denominator cannot be 0, NaN, or Infinity';
```

---

## 二、注释文档问题

### 3. `timer.ts:1-9` — `TimerHandle` 接口缺少 JSDoc

接口本身无任何描述；`set`、`clear`、`clearAll` 三个方法也无文档，用户无法从类型定义了解用法和约束。

**建议补充**

```ts
/**
 * timer / ticker 实例的操作接口
 *
 * 由 {@link createTimer} 和 {@link createTicker} 返回。
 * 每个实例管理自己前缀下的定时器，互不干扰。
 */
export interface TimerHandle {
  /**
   * 注册（或覆盖）一个定时任务，返回清除函数。
   *
   * 同 key 重复调用会先清除上一个定时器再注册新的。
   */
  set(
    key: string,
    callback: () => void | Promise<void>,
    ms: number,
  ): () => void;
  /** 清除指定 key 的定时器 */
  clear(key: string): void;
  /** 清除此实例前缀下的所有定时器 */
  clearAll(): void;
}
```

---

### 4. `events/index.ts:120-140` — `isEventsDelegator` / `isEventsEmitter` 缺少 JSDoc

这两个类型守卫是公开 API，但无任何注释，用户不知道其检测依据（鸭子类型，检测哪些属性）。

**建议补充示例（以 `isEventsEmitter` 为例）**

```ts
/**
 * 检查 obj 是否实现 {@link EventsEmitter} 接口
 *
 * 通过检测 `emit`、`on`、`once`、`off` 四个方法是否存在来判定（鸭子类型）。
 * 任何满足此签名的对象均被视为 emitter。
 *
 * @param obj — 待检查的任意值
 * @returns `true` 当且仅当 obj 具有 emit/on/once/off 方法，同时收窄为 `EventsEmitter<E>`
 */
```

---

### 5. `events/index.ts:237-244` — `linkEvents` 文档不完整

**问题 1**：`@param mode` 只说了 `'on'` 和 `'off'`，遗漏了 `'once'`（该值在 `LinkEventMode` 类型中存在，且在函数体中有对应逻辑）。

**问题 2**：函数返回 `emitter` 本身用于链式调用，但缺少 `@returns`。

**当前文档**
```ts
* @param mode    'on'（默认，添加监听）或 'off'（移除监听）
```

**建议修改**
```ts
* @param mode    `'on'`（默认，普通监听）/ `'once'`（单次监听）/ `'off'`（移除监听）
* @returns       emitter 本身，支持链式调用
```

---

### 6. `async/pending.ts:39-41` — `getPendingCount` 语义不清

**问题描述**

注释写"获取当前等待中的 caller 数量"，但实际上创建 inflight 的**首个 caller** 不计入（`counter.value` 初始为 `0`），只有后续并发 caller 才会累加。返回值是"额外等待者数量"，而非"总并发数"。

**建议修改**

```ts
/**
 * 获取当前与本调用共享同一 inflight 的额外等待者数量（不含首次触发者本身）。
 * 值为 0 表示只有本调用在执行，无其他并发 caller 正在等待。
 */
getPendingCount: () => number;
```

---

### 7. `number.ts:196` — `decimalAdjust` JSDoc 与类型签名偏差（Minor）

JSDoc 写"传 `undefined` 或 **`null`** 或 `0` 时退化"，但参数类型声明为 `exp?: number`，只含 `undefined`，不含 `null`。虽然运行时 `_exp == null` 宽松判断能处理 `null`，但类型层不允许传入 `null`，文档提及会造成歧义。

**建议**：将 JSDoc 中的 `null` 删去，或将参数类型改为 `exp?: number | null`（二选一，保持一致）。

---

## 三、汇总

| 优先级 | 类型 | 文件 | 位置 | 描述 |
|--------|------|------|------|------|
| 🔴 高 | Bug | `events/index.ts` | L264 | `linkEvents('off')` 无法移除 `once()` 回调 |
| 🟡 中 | 错误消息 | `_internal/consts.ts` | L13 | 漏掉 Infinity 情况 |
| 🟡 中 | 文档缺失 | `timer.ts` | L1-9 | `TimerHandle` 接口无 JSDoc |
| 🟡 中 | 文档缺失 | `events/index.ts` | L120, L130 | `isEventsDelegator` / `isEventsEmitter` 无 JSDoc |
| 🟡 中 | 文档不完整 | `events/index.ts` | L237-244 | `linkEvents` 遗漏 `'once'` 模式说明和 `@returns` |
| 🟡 中 | 文档不清 | `async/pending.ts` | L39-41 | `getPendingCount` 语义歧义 |
| 🟢 低 | 文档偏差 | `number.ts` | L196 | `decimalAdjust` JSDoc 提到 `null` 但类型不含 `null` |

---

## 四、整体评价

代码整体质量优秀：逻辑清晰，类型设计严谨，内部实现与公开接口边界分明。大多数守卫、工具函数的注释完备，边界行为（如 `NaN`、`Infinity`、空值）均有说明。

最需要处理的是**第 1 项 Bug**（`linkEvents` off 模式的 once 回调清除失效），其次是**第 2 项错误消息**修正。其余均为文档完善项，不影响运行时正确性。
