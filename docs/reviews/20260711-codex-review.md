# Codex 审查 — 2026-07-11

审查人：Codex（via janpoem）  
范围：`src/` 全量 + 构建配置 + 文档

---

## 概述

`@meld-ts/core` 是一个高质量的 TypeScript 工具库。以下从类型系统、测试、架构、构建、文档等维度进行全面评估，列出优点和待改进项。所有问题按优先级排列：🔴 高 > 🟡 中 > 🟢 低。

---

## ✅ 优点

### 1. 类型系统设计出色
- **泛型推断精准**：`retry(fn)` 返回的函数完全保持原函数签名，`ReturnType` / `Parameters` 均正确；`or(isString, isNumber)` 自动推断为 `string | number`。
- **`InferGuard` 条件类型**：从 `TypeGuard<T>` 中提取 `T`，并在联合类型上自动分布，设计精巧。
- **`UnionToIntersection`**：`implTraits` 中用于合并多个 trait 的 `this` 类型，让跨 trait 互调的类型安全成为可能。
- **`unknown` 守住边界**，`any` 严格限定在基底声明中，符合 TypeScript 最佳实践。

### 2. 测试质量极高
- 414 测试全通过，**100% 函数 + 行覆盖率**。
- 覆盖边界条件极其全面：并发竞态（`singleton` 并发安全）、异常路径（reject 后重试）、空值保护、定时器竞态清理等。
- `singleton` 异步并发测试最为亮眼——`factory reject clears inflight — next call retries` 和 `concurrent calls after a reject all share the new inflight` 等场景覆盖了极易出错的边缘行为。

### 3. 架构简洁明了
- 按功能模块拆分清晰，`guards/` 每种类型一个文件配一个测试文件。
- `_internal/` 层隔离内部常量，避免字符串字面量散布。
- 遵循"不过度抽象"原则——三行能解决的不封装成类。

### 4. 构建体系完善
- `bunup` 构建 ESM + CJS（node）+ IIFE + ESM（browser），双平台输出。
- CI（GitHub Actions）包含 lint / type-check / build / test 四大门禁。
- `bunup.exports.ts` 自动生成 `package.json` 的 `exports` 字段，减少人工维护错误。
- Biome 2.x 格式化 + Lint，配置规范（2 空格、单引号、行宽 80）。

### 5. `StatefulRpc` 设计精巧
- 同一 `key` 的多个并发调用方共享异步结果，`settle()` 批量 resolve/reject。
- `protected` 方法（`newPendingItem`、`addPendingItem`、`removePendingItem`、`onTimeout`）为子类扩展留出清晰的钩子。
- 事件通知与 Promise settle 的分离——先 settle 后 emit，顺序正确。

### 6. `debuggable` 调试系统巧妙
- 通过 `implTraits` + `interface` 声明合并实现类似 Scala/Rust trait 的混入。
- `shouldDebug` 的命名空间解析（`fetch.request` 继承 `fetch` 的开关）实用。
- `setDebug` 合并语义和链式调用符合直觉。

---

## 🔴 高优先级

### H1 · `CLAUDE.md` — `AggregateError` 文档与实际实现不符

CLAUDE.md 中写道：

> 监听器并发执行（`Promise.all`），任意一个抛出时以 `AggregateError` 拒绝

但实际代码 `events/index.ts` 中 `emit` 的实现是：

```ts
await Promise.all(
  [...set].map((fn) =>
    Promise.resolve()
      .then(async () => fn(params))
      .catch((err) => options?.onError?.(err, name)),
  ),
);
```

每个监听器的异常被 `.catch()` 静默接管，通过 `onError` 通知，**不会抛 `AggregateError`**。文档与实现存在严重不一致，可能导致调用方误以为可以 `try/catch` emit。

**建议**：修正 `CLAUDE.md` 中的说明，明确：
- `emit` 不会因监听器异常而 reject
- `onError` 是唯一的错误通知渠道
- `emit` 返回的 Promise 只在内部发生非预期异常时才 reject

---

### H2 · `path.ts` — 默认无安全策略，路径遍历攻击可穿透

`createPathUtils` 默认不启用任何安全检查：

```ts
// dangerReplace 默认 undefined
// join('/var/www', '../../../etc') 会返回 '../../../etc'
```

虽然设计上通过回调注入安全策略体现了"可插拔"理念，但对不读文档的用户是一个陷阱。

**建议**：提供两个预设工厂：
- `createPathUtils()` — 保持当前无安全检查的行为，JSDoc 注明安全风险
- `createSafePathUtils(root)` — 开箱即用，默认拒绝绝对路径、移除 `..` 段、限制在根目录内

---

## 🟡 中优先级

### M1 · `path.ts` — `join` 实现使用闭包副作用模式，可读性差

`handlePart` 通过闭包共享 `parts` 数组，递归调用时副作用不直观：

```ts
const join = (...paths: PathInput[]): string => {
  let parts: string[] = [];

  const handlePart = (input: string, isPurged = false) => {
    // ... 修改外部 parts，间接递归
    parts.push(part);
  };

  for (const path of paths) {
    handlePart(path);
  }
  return parts.join(separator);
};
```

虽然当前逻辑正确，但递归 + 闭包副作用使得行为难以追踪。

**建议**：改为纯函数式递归，返回数组拼接：

```ts
const processPart = (input: string, isPurged = false): string[] => {
  const part = isPurged ? input.trim() : purge(input);
  if (part === '' || part === '.') return [];
  if (part.includes(separator)) {
    return part.split(separator).flatMap(p => processPart(p, true));
  }
  if (part === '..') {
    // 此处的向上消除需要外部 parts 上下文，需要调整
  }
  return [part];
};
```

或者保持当前实现，但改为返回新数组而非修改闭包变量。

> 注意：`..` 的向上消除逻辑需要前驱上下文，纯函数式改造需要重新设计。建议至少重构 `parts` 为显式参数传递。

---

### M2 · `isPromise` — thenable 判断过于严格

```ts
export const isPromise = <T = unknown>(val: unknown): val is Promise<T> =>
  val instanceof Promise ||
  (typeof val === _typeObj &&
    val !== null &&
    typeof (val as Promise<T>).then === _typeFunc &&
    typeof (val as Promise<T>).catch === _typeFunc);
```

同时要求 `then` 和 `catch`，不符合 Promise/A+ 规范（只需 `then`）。合法的 A+ thenable `{ then: fn }` 会被判为 `false`。JSDoc 已注明这点，但运行时存在潜在兼容问题。

**建议**：
- 如果目的是防御恶意 thenable，保留当前实现，但将函数名改为 `isSafePromise` 或 `isNativePromise`
- 如果目的是检测可 `await` 的值，只检查 `then` 方法（符合规范）

---

### M3 · `timer.ts` — `Record` 存储存在原型链污染风险

```ts
const store: Record<string, TimerId<Mode>> = {};

// ...
const clear = (key: string) => {
  if (Object.hasOwn(store, k)) { ... }
};
```

虽然测试中 `key "toString" does not collide with prototype` 已覆盖，`Object.hasOwn` 也排除了原型属性，但使用 `Record` 而非 `Map` 仍然是不太安全的模式——如果有代码在 `Object.prototype` 上添加了枚举属性（极端场景），`Object.keys(store)` 会被污染。

**建议**：改用 `Map<string, TimerId<Mode>>`，彻底消除原型链风险：

```ts
const store = new Map<string, TimerId<Mode>>();

const clear = (key: string) => {
  const k = fullKey(key);
  if (store.has(k)) {
    impl.clear(store.get(k)!);
    store.delete(k);
  }
};
```

---

### M4 · 缺少 `debounce` / `throttle`

`retry`、`timeout`、`sleep`、`pending` 都有，但缺少前端开发中最常用的 `debounce` 和 `throttle`。README 明确说面向浏览器，这两个工具的缺失会让前端开发者仍需额外依赖 lodash。

**建议**：新增 `src/async/debounce.ts` 和 `src/async/throttle.ts`，参考 lodash 语义，但保持当前项目的泛型精准风格。

```ts
// 预期 API
const handleInput = debounce((e: InputEvent) => { ... }, 300);
const handleScroll = throttle((e: Event) => { ... }, 100);
```

---

## 🟢 低优先级

### L1 · `decimalAdjust` — 字符串拼接实现缺少注释

```ts
_value = Math[type](
  +(_parts[0] + 'e' + (_parts[1] ? +_parts[1] - _exp : -_exp)),
) as number;
```

使用 e-notation 字符串拼接避免浮点精度问题是经典技巧（参考 MDN），但对不熟悉此技巧的维护者来说难以理解。

**建议**：在 `decimalAdjust` 函数体上方添加一段注释，说明 e-notation 移位法的原理和参考来源（MDN 链接已在 JSDoc 中）。

---

### L2 · `_internal` 常量命名约定冗余

```ts
// _internal/consts.ts
export const _typeStr = 'string' as const;
export const _typeNum = 'number' as const;
```

下划线前缀暗示私有，但 `_internal/` 目录本身已经表达了内部含义，双重标记略显冗余。且这些常量被 guards 消费后间接对外暴露（虽然运行时被内联消除了）。

**建议**：考虑去掉下划线前缀，或将 `_internal/consts.ts` 中的常量改为非导出（仅通过 `_internal/index.ts` 统一导出）。

---

### L3 · 浏览器 IIFE 全局变量缺少 `noConflict`

```ts
// src/browser/iife.ts
globalThis.MeldTS = MeldTSCore;
```

如果页面加载多个版本的 `@meld-ts/core`，后加载的会覆盖先加载的全局变量。

**建议**：参考 jQuery / lodash 的 `noConflict` 模式：

```ts
const previousMeldTS = globalThis.MeldTS;

globalThis.MeldTS = Object.assign(MeldTSCore, {
  noConflict: () => {
    globalThis.MeldTS = previousMeldTS;
    return MeldTSCore;
  },
});
```

---

### L4 · README 缺少组合用法示例

README 有模块表格和独立导入示例，但缺少常见组合用法的端到端示例。新用户需要翻阅 TypeDoc 文档才能理解如何组合使用。

**建议**：在 README 增加"常见模式"章节，展示：
- `retry` + `timeout` 组合：带超时的重试请求
- `pending` + `singleton` 组合：惰性初始化且去重的数据获取
- `createEmitter` + `createDelegator` 组合：组件事件管理

---

## 📊 总体评价

| 维度 | 评分 | 评价 |
|------|------|------|
| 类型系统设计 | ⭐⭐⭐⭐⭐ | 泛型推断精准，条件类型设计精巧 |
| 测试质量 | ⭐⭐⭐⭐⭐ | 100% 覆盖率，边界场景极为全面 |
| 代码可读性 | ⭐⭐⭐⭐ | 注释质量高，部分实现（path join）可更清晰 |
| 架构设计 | ⭐⭐⭐⭐ | 模块拆分合理，"不过度抽象"原则好 |
| 构建/CI | ⭐⭐⭐⭐⭐ | 完善的 CI 门禁，双平台构建 |
| 文档 | ⭐⭐⭐⭐ | TypeDoc + README 完善，CLAUDE.md 有一处不一致 |
| 安全性 | ⭐⭐⭐ | path 默认不安全，需要用户主动配置 |

**综合评价**：这是一个高质量的 TypeScript 工具库，类型系统设计是其最大亮点。测试覆盖率 100% 且质量高，显示了作者对代码质量的追求。高优先级问题集中在文档不一致（H1）和默认安全策略缺失（H2）上，修复成本低但影响大。中低优先级问题多为代码风格和功能补全建议，整体瑕不掩瑜。作为基础工具库，已经具备了生产使用的成熟度。
