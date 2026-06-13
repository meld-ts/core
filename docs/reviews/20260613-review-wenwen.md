# Code Review — meld-ts/core

**审查者**：文文@AI-SOUL  
**日期**：2026-06-13  
**范围**：`src/` 全目录（排除 web / http）  
**前置审查**：KAI@deepseek、知薇@AI-SOUL  
**复检记录**：2026-06-13（KAI@deepseek 修复后两轮复检，全部通过）

---

## 一、Bug / 行为缺陷

### 1. `events/index.ts` — `linkEvents` 无法正确移除 `once()` 标记的回调 【Bug】✅ 已修复

**问题描述**

`linkEvents(emitter, callbacks, 'on')` 遇到 `once()` 标记的 item 时，调用 `emitter.once(key, fn)`——内部注册的是一个**包装函数（wrapper）**，原始 `fn` 从未进入 listeners Set。

但 `linkEvents(emitter, callbacks, 'off')` 调用的是 `emitter.off(key, fn)`，传的是原始 `fn`，永远找不到匹配项，实际上 off 无效。

```ts
if (mode === 'off') {
  emitter.off(key, fn);  // ❌ fn 不在 Set 里，once 注册的是 wrapper
}
```

**影响范围**

使用 `linkEvents(emitter, callbacks, 'on')` 注册含 `once()` 的 callbacks，再用 `linkEvents(emitter, callbacks, 'off')` 取消时，`once` 回调不会被移除，可能造成内存泄漏或重复触发。

`createDelegator` **不受影响**（内部通过持有 unsubscribers 数组管理取消）。

**修复记录（第一轮）**

废弃 wrapper 方案，改用 `WeakMap<fn, true>`（`_onceFlags`）在 emit 后统一清理 once 回调。`off(name, fn)` 可直接命中 fn 本身，`createDelegator` 同步改为 `emitter.on(key, fn, isOnce)`。

**复检发现的后续问题（第二轮）**

`_onceFlags: WeakMap<fn, true>` 未做事件级隔离——同一 fn 注册到不同事件（一个 once、一个非 once）时，会误删非 once 事件的回调；且 `off()` 未清理 flag，重新注册后 flag 残留仍会触发误删。

**修复记录（第二轮）**

`_onceSets: Map<keyof E, WeakSet<fn>>` 替代 WeakMap，按事件名隔离 once 标记。unsubscriber 中同步调用 `_onceSets.get(name)?.delete(callback)` 清除标记，emit 清理时只取当前事件的 WeakSet，两个问题同时解决。

---

### 2. `_internal/consts.ts:13` — 错误消息不准确 【Minor Bug】✅ 已修复

**问题描述**

```ts
// 修复前
export const _errDenominatorZero = 'The denominator cannot be 0 or NaN';
```

`calcProgress` 的实际校验是 `total === 0 || !isNumber(total)`，而 `isNumber` 会排除 `NaN`、`Infinity`、`-Infinity` 三种情况，错误消息漏掉了 `Infinity`。

**修复记录**

```ts
// 修复后
export const _errDenominatorZero = 'The denominator cannot be 0, NaN, or Infinity';
```

---

## 二、注释文档问题

### 3. `timer.ts` — `TimerHandle` 接口缺少 JSDoc ✅ 已修复

接口本身及 `set`、`clear`、`clearAll` 三个方法均已补充完整 JSDoc。

---

### 4. `events/index.ts` — `isEventsDelegator` / `isEventsEmitter` 缺少 JSDoc ✅ 已修复

两个类型守卫均已补充 JSDoc，包含检测依据（鸭子类型，检测哪些方法）、`@param` 和 `@returns`。

---

### 5. `events/index.ts` — `linkEvents` 文档不完整 ✅ 已修复

`@param mode` 已补充 `'once'` 模式说明，`@returns` 已补充链式调用说明。

---

### 6. `async/pending.ts` — `getPendingCount` 语义不清 ✅ 已修复

已修改为：

```ts
/**
 * 获取与当前调用共享同一 inflight 的额外等待者数量
 *
 * 首次触发者的 counter 初始为 0，后续并发 caller 会累加。
 * 值为 0 表示只有当前调用在执行，无其他并发 caller 等待。
 */
getPendingCount: () => number;
```

---

### 7. `number.ts` — `decimalAdjust` JSDoc 与类型签名偏差 ✅ 已修复

JSDoc 中 `null` 已删去，与 `exp?: number` 的类型签名保持一致。

---

## 三、汇总

| 优先级 | 类型 | 文件 | 描述 | 状态 |
|--------|------|------|------|------|
| 🔴 高 | Bug | `events/index.ts` | `linkEvents('off')` 无法移除 `once()` 回调 | ✅ 已修复（两轮） |
| 🟡 中 | 错误消息 | `_internal/consts.ts` | 漏掉 Infinity 情况 | ✅ 已修复 |
| 🟡 中 | 文档缺失 | `timer.ts` | `TimerHandle` 接口无 JSDoc | ✅ 已修复 |
| 🟡 中 | 文档缺失 | `events/index.ts` | `isEventsDelegator` / `isEventsEmitter` 无 JSDoc | ✅ 已修复 |
| 🟡 中 | 文档不完整 | `events/index.ts` | `linkEvents` 遗漏 `'once'` 说明和 `@returns` | ✅ 已修复 |
| 🟡 中 | 文档不清 | `async/pending.ts` | `getPendingCount` 语义歧义 | ✅ 已修复 |
| 🟢 低 | 文档偏差 | `number.ts` | `decimalAdjust` JSDoc 提到 `null` 但类型不含 `null` | ✅ 已修复 |

---

## 四、整体评价

代码整体质量优秀：逻辑清晰，类型设计严谨，内部实现与公开接口边界分明。大多数守卫、工具函数的注释完备，边界行为（如 `NaN`、`Infinity`、空值）均有说明。

本次审查共提出 7 项问题（1 个 Bug、1 个错误消息、5 个文档），均已由 KAI@deepseek 完成修复并通过复检。其中 Bug #1 经历两轮修复——第一轮解决了核心问题，第二轮补齐了 per-event 隔离和 off 时的标记清理，最终实现干净正确。
