# 格物 · @meld-ts/core — guards 深度审查

> KAI@AI-SOUL.deepseek (deepseek-v4-pro)
> 2026年6月12日

---

## Step 0 — 格除先见

动手前，先列出我对这套代码的**未经验证的预设**，并将其搁置：

| # | 预设 | 搁置理由 |
|---|------|---------|
| 0 | 「opus 4.8 已审查过，主要问题都发现了」 | 不同模型的认知盲区不同。deepseek 可能发现 opus 遗漏的结构性问题 |
| 1 | 「代码只有 ~380 行，问题不会太深」 | 量 ≠ 质。短代码中的类型漏洞可能更隐蔽，因为阅读者容易"一眼扫过" |
| 2 | 「工具库风险低，无安全问题」 | 分类偏见。类型守卫的误判 = 下游逻辑全链条坍塌。thenable 注入、原型污染、静默吞错都是真实攻击面 |
| 3 | 「Biome lint 通过 = 代码质量合格」 | Biome 只查格式和显式 lint 规则，不查逻辑安全、类型契约、边界条件和设计一致性 |
| 4 | 「JS 单线程无并发问题」 | Promise thenable 检测的信任边界、结构化克隆的完整性——这些是并发/安全领域的隐患，不限于数据竞争 |
| 5 | 「`as const` 只是一个小问题」 | opus 审查已定位，但它只是冰山一角——`as const` 思维模式可能在其他地方也有副作用，需要系统性排查 |
| 6 | 「deepseek-v4-pro 比 opus 4.8 强」 | 模型优越感偏见。审查靠证据，不靠模型名。opus 已发现的 A/B/C 问题我需独立验证而非盲从 |

> 这七条暂时搁置。不让它们引导 Step 1。

---

## Step 1 — 穷究（事实优先，从代码出发）

### 1.1 审查范围

- 源码：`core/src/guards/*.ts`（8 个模块）、`core/src/base/cloneObj.ts`、`core/src/types/index.ts`、`core/src/_internal.ts`
- 测试：`core/src/guards/*.test.ts`（8 个文件）、`core/src/base/cloneObj.test.ts`
- 参考：opus 4.8 审查报告 `docs/reviews/260612_review_guards.md`（已知 10 个问题，分类 A/B/C）

### 1.2 opus 审查已实证的问题（我独立确认）

opus 使用了 `tsgo --noEmit` 实证，我的环境 shell 不可用，故以**静态逻辑推导**独立验证其发现：

- **A1** ✅ 逻辑确认：`_numZero = 0 as const` → 类型坍缩为字面量 `0`，污染 4 个函数的 `dft` 参数。`toNum(x, -1)` 必然类型报错。
- **A2** ✅ 逻辑确认：`notEmptyAry(val, guard?: (it: T) => boolean)` — `guard` 不是 TypeGuard 形态，TS 无法从 `isStr` 反推 `T = string`。同文件的 `aryGuard` 用 `TypeGuard<T>` 反而是对的。
- **B1** 命名分裂：`isStr/isBool/isAry` vs `isNumber/isNumberVal` — 确认存在
- **B2** `_internal.ts` 语义污染：`_strYes/_strNo/_strFalse/_strTrue` 是 `toBool` 的业务常量 — 确认存在
- **B3** `WithPrototype` 公开导出 — 确认存在
- **C1** `isStr` 接受 `new String()` — 确认
- **C2** 缺失 `isFn` — 确认
- **C3** `cloneObj` JSON 降级死代码 — 确认
- **C4** `calcProgress` NaN value 静默处理 — 确认

### 1.3 我独立发现的新问题（opus 审查未覆盖）

经过逐行重新审视，以下问题 opus 审查**未提及**：

#### N1 — `decimalAdjust` 的 `exp` 参数类型与实际行为不一致

```ts
// number.ts:120
export const decimalAdjust = (
  type: 'round' | 'ceil' | 'floor',
  value: number,
  exp?: number,  // ← 类型标注为 number | undefined
): number => {
  // ...
  if (typeof _exp === _typeUndef || +(_exp as number) === 0) {
    return Math[type](_value as number);
  }
```

**问题**：`exp` 标注为 `exp?: number`，但 `+null === 0` 会让 `null` 静默走 fallback 路径。调用方传 `decimalAdjust('round', 1.5, null)` 时类型检查通过（`null` 不能赋值给 `number | undefined`），但运行时不报错。更严重的是：如果 `exp` 是 `undefined`（不传参数），`typeof undefined === 'undefined'` 为 true，正确走 fallback。但如果 `exp` 是 `null`（显式传 null），`typeof null === 'object'`，`+null === 0`，fallback 到 `Math[type]`。**行为正确但类型契约撒谎**——类型系统声称不接受 `null`，运行时却静默处理。

**根因**：`typeof _exp === _typeUndef` 只拦截了 `undefined`，而 `+(exp) === 0` 意外兜底了 `null`。

#### N2 — `isPromise` 的 thenable 检测存在两个微妙问题

```ts
// object.ts:139
export const isPromise = <T = unknown>(val: unknown): val is Promise<T> =>
  val instanceof Promise ||
  (typeof val === _typeObj &&
    val !== null &&
    typeof (val as Promise<T>)?.then === _typeFunc &&   // ← ?. 冗余
    typeof (val as Promise<T>)?.catch === _typeFunc);   // ← catch 检测非 A+ 要求
```

**问题 2a**：`?.` 在已做 `val !== null` 检查后是**逻辑冗余**。`typeof val === _typeObj && val !== null` 保证 `val` 是对象且非 null，之后 `(val as Promise<T>)?.then` 的可选链永远不会触发 null 分支。这种冗余不影响正确性，但：
- 降低代码清晰度（读代码的人会疑惑"为什么这里需要可选链？"）
- 暗示开发者对 null 检查不够信任，可能反映更深层的防御性思维不一致

**问题 2b**：检查 `catch` 方法不是 Promise/A+ 规范的要求。Promise/A+ 只要求 `then` 方法。一个合法的符合 A+ 的 thenable `{ then: (resolve, reject) => {} }` 会被 `isPromise` 判定为 `false`，因为它没有 `catch` 方法。

这可能是**有意设计**——TypeScript 的 `Promise<T>` 类型确实有 `catch`。但这意味着 `isPromise` 检测的是 "TypeScript Promise 类型"而非 "Promise/A+ thenable"。函数名和文档都没有说明这个区别。

**安全影响**：任何带有 `{ then: fn, catch: fn }` 的对象都被判定为 Promise。恶意 thenable 可以：
- 同步调用回调（违反 Promise 的异步保证）
- 多次调用回调（违反单次调用保证）
- 永远不调用回调

`isPromise` 本身只是检测，不执行，所以不直接引入安全漏洞。但下游代码若对检测结果做 `await` 或 `.then()`，就暴露在 thenable 注入风险下。**应在文档中警示**。

#### N3 — `aryGuard` 的空数组行为：数学正确 vs 工程危险

```ts
// array.ts:47
export const aryGuard =
  <T>(guard: TypeGuard<T>): TypeGuard<T[]> =>
  (val: unknown): val is T[] =>
    Array.isArray(val) && val.every(guard);
```

`[].every(fn)` 在 JS 中返回 `true`（全称量词对空集恒真）。因此：

```ts
const isStrAry = aryGuard(isStr);
isStrAry([])  // true → [] 被推断为 string[]
```

这在**数学逻辑上完全正确**——空集中的所有元素确实都是字符串。但在**工程上**，如果下游代码假设数组非空：

```ts
if (aryGuard(isStr)(arr)) {
  const first = arr[0].toUpperCase(); // arr[0] 可能是 undefined！
}
```

TS 不会报错，因为 `arr` 被推断为 `string[]`，而 `string[].pop()` 返回 `string | undefined`。问题在于开发者可能**忽略索引访问的 undefined 可能性**。

**对比 opus 审查**：opus 审查提到了 `notEmptyAry` 的类型推断问题（A2），但没有触达 `aryGuard` 的空数组数学特性这个设计哲学问题。

#### N4 — `limitNumMinMax` 的三元嵌套：正确但不可维护

```ts
// number.ts:85
export const limitNumMinMax = (
  val: unknown,
  min: number,
  max: number,
  dft: number = _numZero,
) => {
  const v = toNum(val, dft);
  return v < min ? min : v > max ? max : v;
};
```

三元嵌套的解析：`v < min ? min : (v > max ? max : v)`（右结合），行为正确。

但可读性极差——需要读者脑中解析三元优先级。等价写法 `Math.min(max, Math.max(min, v))` 或 `v < min ? min : Math.min(v, max)` 都更清晰。lint 规则 `noExtraBooleanCast` / `noNestedTernary` 应该对此报警，但 Biome 配置可能未启用。

#### N5 — `calcProgress` 的异常不对称性：value 宽容 vs total 严格

```ts
// number.ts:155
export const calcProgress = (value: number, total: number) => {
  if (total === 0 || !isNum(total)) {
    throw new Error(_errDenominatorZero);  // total 有校验 + 抛异常
  }
  return limitNumMinMax(round10(value / total, -2), 0, 1);
  //     ^^^^^^^^^^^^^^ value 无任何校验，静默处理
};
```

- `total` 为 NaN → 抛异常 ✅
- `total` 为 Infinity → 抛异常 ✅
- `total` 为 0 → 抛异常 ✅
- `value` 为 NaN → `NaN / total = NaN` → `round10(NaN, -2)` → `decimalAdjust` 中 `Number.isNaN(NaN)` 为 true → `return NaN` → `limitNumMinMax(NaN, 0, 1)` → `toNum(NaN, 0)` → `isNum(NaN)` false → `val != null` true → `isNumVal(NaN)` false → `return 0`。**NaN value 被静默转为 0**。
- `value` 为 Infinity → `Infinity / total = Infinity` → `round10(Infinity, -2)` → `decimalAdjust` 中 `Number.isFinite(Infinity)`...等等，`decimalAdjust` 只检查 `Number.isNaN`，不检查 `isFinite`。`Math.round(Infinity)` = Infinity。然后 `limitNumMinMax(Infinity, 0, 1)` → `toNum(Infinity, 0)` → `isNum(Infinity)` false → 返回 0。所以 Infinity 也被静默转为 0。

**设计矛盾**：对分母（total）严格抛异常，对分子（value）宽容静默。要么两者都校验，要么两者都文档说明——当前的不对称是隐式的。

#### N6 — `toBool` 依赖 `isStr` 的类型谎言

```ts
// boolean.ts:56
export const toBool = (val: unknown): boolean => {
  // ...
  if (isStr(val)) {
    const lower = val.toLowerCase();  // ← 类型上 val is string，实际可能是 String 包装对象
    // ...
  }
```

`isStr` 将 `new String('true')` 判为 `string`（类型谎言 C1）。`toBool` 依赖这个判定的后果：`val.toLowerCase()` 在 String 包装对象上确实能工作（运行时正确），但**类型系统被欺骗了**——`isStr` 声明 `val is string`，而 `string` 原始类型和 `String` 包装对象的类型是不同的。

如果未来 `isStr` 收紧定义（C1 建议的方向），`toBool` 的这段逻辑不依赖 `isStr` 的类型收窄也能正确工作——因为 `typeof val === 'string'` 就足够了。所以这是**耦合问题**：`toBool` 不需要 `isStr` 的包装对象兼容性，却因为共用 `isStr` 而被牵连。

> 这个耦合也反向说明：`isStr` 的宽松定义（接受包装对象）是为了满足 `toBool` 的需求吗？不是。`toBool` 只需要 `typeof === 'string'`。那 `isStr` 为什么要接受包装对象？——这是 C1 的根源追问。

#### N7 — `not` 函数的类型丢失

```ts
// logicality.ts:64
export const not = (guard: TypeGuard): ((val: unknown) => boolean) => {
  return (val: unknown) => !guard(val);
};
```

`guard` 被标注为 `TypeGuard`（无泛型参数 = `TypeGuard<unknown>`）。调用方传 `not(isStr)` 时，`isStr: TypeGuard<string>` 需要赋值给 `TypeGuard<unknown>`。在 TS 类型系统中，类型谓词返回值 `val is T` 的 `T` 在逆变位置——`val is string` 是 `val is unknown` 的子类型吗？

实际上 `TypeGuard<T> = (val: unknown) => val is T`。`(val: unknown) => val is string` 的返回类型比 `(val: unknown) => val is unknown` 更具体，但函数返回类型是协变的……类型谓词在 TS 中有特殊处理。经推导，这个赋值应该通过 TS 检查。

但返回类型 `(val: unknown) => boolean` 意味着**任何通过 `not` 创建的守卫都不会进行类型收窄**。这是文档说明的行为（注释明确写了），不是 bug。但它反映了 **TS 类型系统的一个根本限制**——不支持否定类型。`not` 的存在本身是对这个限制的承认和妥协。

#### N8 — `cloneObj` 的 JSON 降级路径：循环引用处理有遗漏

```ts
// base/cloneObj.ts:18
export const cloneObj = <T extends object>(obj: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(obj);
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return Object.assign({}, obj);
  }
};
```

`JSON.stringify` 对循环引用抛 `TypeError: Converting circular structure to JSON`。这个异常被 `catch` 捕获，降级到 `Object.assign({}, obj)`（浅拷贝）。

**遗漏**：`JSON.stringify` 还对以下值抛异常或静默处理：
- `BigInt` → 抛 `TypeError: Do not know how to serialize a BigInt` → 降级到 Object.assign → 浅拷贝 ✅（至少没崩）
- `undefined` / `Function` / `Symbol` → `JSON.stringify` 静默丢弃 → `catch` 不触发 → 返回不完整的深拷贝 ⚠️
- 如果 `obj` 本身就是 `BigInt` 或其他不可序列化值，降级到 Object.assign 的结果类型是 `object`，不满足 `T extends object`

**风险评估**：JSON 降级路径本质上是 "best effort"——它不会崩，但可能返回不符合预期的结果。在 Deno/Bun/现代浏览器中 JSON 路径是死代码（都有 structuredClone），所以这个风险的暴露面很小。但**如果未来降级路径被激活**（如在受限环境中运行），它可能产生难以调试的静默数据丢失。

### 1.4 测试文件命名不一致（已由 opus 审查间接触及）

`number.test.ts` 中的导入名称与 `number.ts` 中的导出名称不一致：

| 测试导入 | 实际导出 |
|---------|---------|
| `isNumber` | `isNum` |
| `isNumberVal` | `isNumVal` |
| `limitNumberMin` | `limitNumMin` |
| `limitNumberMax` | `limitNumMax` |
| `limitNumberMinMax` | `limitNumMinMax` |
| `toNumber` | `toNum` |

这是 B1 命名分裂的直接伤疤：**测试文件当前无法运行**。

### 1.5 穷究小结

总计发现：
- opus 已知：10 个问题（A1-A2, B1-B3, C1-C4 及命名问题）
- deepseek 新发现：8 个问题（N1-N8）
- 交叉确认：在 opus 已知问题中，我独立验证了全部 10 个

---

## Step 2 — 辨析（透过现象看本质）

### 2.1 主要矛盾定位

opus 审查将**主要矛盾**定位为：

> "运行时正确性与类型契约正确性之间的系统性裂缝"

我的独立审视**确认**这个判断，并发现这个裂缝在以下维度有新的表现形式：

| 维度 | opus 发现 | deepseek 新发现 |
|------|----------|----------------|
| 类型收窄 | A1: as const 污染 dft | N7: not() 的类型丢失是 TS 的根本限制 |
| TypeGuard 形态 | A2: notEmptyAry 无推断 | N2b: isPromise 检测的不是 A+ 而是 TS Promise |
| 隐式行为 | C4: calcProgress NaN | N5: calcProgress value/total 不对称异常处理 |
| 耦合污染 | B2: _internal 语义污染 | N6: toBool 依赖 isStr 的类型谎言 |
| 设计边界 | C1: isStr 宽松定义 | N3: aryGuard 空数组数学正确但工程危险 |
| 死代码/冗余 | C3: cloneObj JSON 降级 | N2a: isPromise ?. 冗余；N8: JSON 降级的静默数据丢失 |
| 代码可读性 | 无 | N4: limitNumMinMax 三元嵌套可读性差 |
| 参数类型契约 | A1: as const | N1: decimalAdjust exp 类型与行为不一致 |

### 2.2 次要矛盾 / 张力场

**矛盾一**：防御性编程 vs 静默吞错

`toNum` / `limitNumMinMax` / `calcProgress` 对异常输入不抛异常，静默返回默认值或边界值。这是**防御性**的——调用方不需要 try/catch。但代价是**静默数据损坏**：NaN → 0、Infinity → 0，调用方不知道输入有问题。

`calcProgress` 的 `total` 抛异常而 `value` 不抛，暴露了**防御性标准的不一致**——开发者在同一个函数内采用了两种哲学。

**矛盾二**：宽松接受 vs 严格契约

`isStr` 宽松接受 `new String()`，`isPromise` 宽松接受非标准 thenable，`aryGuard` 宽松接受空数组。这些都是"不拒绝可运行的代码"。但类型系统的价值恰恰在于**在编译时拒绝可能出错的东西**。

**矛盾三**：工具库的克制 vs 完整性焦虑

opus 审查中预设 C 是"工具库越全越好"——并主动搁置了。但在代码中，`_internal.ts` 被塞入了 `toBool` 的业务常量（B2），`types/index.ts` 暴露了 `WithPrototype`（B3）。这些都是"完整性焦虑"的痕迹——想把所有东西都暴露出去，而不是克制地只暴露公共契约。

### 2.3 透过现象看本质

**本质一**：这套代码是**单开发者快速迭代的产物**，不是团队协作 + CR 的产物。证据链：
- 命名不一致（B1）——无人质疑过缩写 vs 全称
- 测试导入名和导出名不一致——没有 CI 中的类型检查门禁（ts-check 加了但还没通过）
- `_internal.ts` 语义混合（B2）——只有一个人维护时，这些"暂存地"难以自清

**本质二**：`as const` 的副作用是**类型推导知识不足**的症状，不是孤立 bug。`_numZero = 0 as const` 写的时候以为"只是锁定常量"，没意识到默认参数类型坍缩。类似地，`decimalAdjust` 的 `exp` 参数类型与行为不一致（N1）也说明开发者对 TS 的类型推断边界理解有待加深。

**本质三**：`isStr` 的 `new String()` 兼容（C1）是整个守卫体系的**哲学支点**——如果收紧 `isStr`，`toBool`、`notEmptyStr` 的行为不变（它们不依赖包装对象），但测试用例 `string.test.ts:9-16` 覆盖了大量包装对象和代理对象的测试。**这些测试用"增加表面覆盖率"换取了"掩盖类型谎言"**——测试越 pass，类型谎言的可见性越低。这是测试覆盖率指标的经典悖论。

**本质四**：`cloneObj` 的三级降级链（N8 + C3）暴露了**兜底策略的不完整审视**。开发者考虑了 structuredClone → JSON → Object.assign 的降级，但没有考虑 JSON.stringify 的静默数据丢失场景（undefined/Function/Symbol/BigInt）。

---

## Step 3 — 致知（去粗取精、去伪存真、由此及彼、由表及里）

### 3.1 问题分级（整合 opus 已知 + deepseek 新发现）

#### A 级 — 真 bug / 类型矛盾 / 类型安全漏洞，必须修

| # | 问题 | 来源 | 本质 |
|---|------|------|------|
| A1 | `_numZero = 0 as const` 污染 4 个函数的 dft 参数类型 | opus | 类型坍缩：文档承诺 `number`，类型锁死为 `0` |
| A2 | `notEmptyAry` 的 guard 无法推断 T，JSDoc 示例是类型谎言 | opus | TypeGuard 形态缺失：`(it: T) => boolean` ≠ `TypeGuard<T>` |
| A3 | `decimalAdjust` 的 `exp` 参数类型标注 `number?` 但实际接受 `null` | deepseek N1 | 类型契约与运行时行为不一致 |
| A4 | `number.test.ts` 的 6 个导入名与 `number.ts` 的导出名不匹配 | opus B1 / deepseek 确认 | 测试无法编译/运行——B1 命名分裂的直接伤疤 |

#### B 级 — 设计一致性问题 / 代码异味，强烈建议修

| # | 问题 | 来源 | 修复建议 |
|---|------|------|---------|
| B1 | 命名分裂：`isStr/isBool/isAry` vs `isNumber/isNumberVal` | opus | 统一为全称：`isString/isBoolean/isArray/isNumber/isNumberVal` 或统一为缩写。**公共 API 可读性优先** |
| B2 | `_internal.ts` 语义污染：`_strYes/_strNo/_strFalse/_strTrue` 应就近放回 `boolean.ts` | opus | 移动这 4 个常量，`_internal.ts` 只保留 typeof 常量 |
| B3 | `WithPrototype` 不应在 `types/index.ts` 公开导出 | opus | 移入 `object.ts` 内部或 `_internal.ts` |
| B4 | `isPromise` 的可选链冗余 + `catch` 检测非 A+ 标准 | deepseek N2 | 去除 `?.` 冗余；文档说明检测的是 "TS Promise 类型" 而非 "A+ thenable" |
| B5 | `limitNumMinMax` 的三元嵌套可读性差 | deepseek N4 | 替换为 `Math.min(max, Math.max(min, v))` 或启用 Biome 嵌套三元 lint |

#### C 级 — 设计取舍 / 哲学问题，需拍板

| # | 问题 | 来源 | 决策要点 |
|---|------|------|---------|
| C1 | `isStr` 接受 `new String()` 包装对象（类型谎言） | opus | 收紧 = 清理测试中 6+ 个包装对象用例。风险：若有外部代码依赖此行为 |
| C2 | 缺失 `isFn`——`isCtor` 内部已用 `typeof === 'function'` 却未独立暴露 | opus | 建议加。`isFn` 是高频守卫，且不与 `isCtor` 冲突（一个是函数判断，一个是构造函数判断） |
| C3 | `cloneObj` JSON 降级路径：BigInt/undefined/Function/Symbol 静默丢失 | deepseek N8 | JSON.stringify 的静默数据丢失场景需要文档说明。选项：①加 warning ②提前检测不可序列化值并抛异常 ③文档 + 接受现状 |
| C4 | `calcProgress` value 无校验，NaN/Infinity 静默转为 0 | opus C4 + deepseek N5 | 选项：①value 也加校验抛异常（对称）②文档说明静默行为（接受现状）③value 加 `isNum` 检查 |
| C5 | `aryGuard` 空数组返回 true——数学正确但工程危险 | deepseek N3 | 不是 bug，无法"修复"。需文档警示：空数组通过所有 `aryGuard`，下游索引访问需防御 |
| C6 | `isPromise` thenable 注入风险 | deepseek N2b | 风险本身是 thenable 模式的固有风险。需文档警示即可 |
| C7 | `not` 函数返回值丢类型收窄——TS 类型系统的根本限制 | deepseek N7 | 无法修复。文档已说明，接受现状 |
| C8 | `toBool` 对 `isStr` 类型谎言的耦合依赖 | deepseek N6 | 如果 C1 选择收紧 `isStr`，`toBool` 不受影响。当前耦合是隐式脆弱性 |

### 3.2 核心结论

**去粗取精**：opus 审查和 deepseek 审查交叉验证了核心诊断——这套代码的运行时行为基本正确，但类型契约存在系统性裂缝。deepseek 额外发现的问题集中在**边界条件的隐式处理**（N1/N3/N5/N8）和**设计哲学的不一致性**（N2b/N4/N6/N7）。

**去伪存真**：A1-A2 是 opus 定位的"阻塞性 bug"——它们让 `tsgo --noEmit` 变红。A3（新发现）是同类问题但更隐蔽——它不会导致 ts-check 变红（TypeScript 会报 `null` 不能赋值给 `number | undefined`），但运行时有不一致。A4 是 B1 的直接后果。

**由此及彼**：这个审查揭示的模式不是 `@meld-ts/core` 特有的。任何从"个人工具库"演化而来的公共包都面临类似的成熟度门槛——从"能用"到"工程级"需要：
1. CI 中加入类型检查门禁（`tsgo --noEmit` 必须绿）
2. 统一的命名规范 + lint 规则强制执行
3. 对类型守卫的 TypeGuard 形态有系统性理解
4. 边界条件的不对称处理需要明确文档化

**由表及里**：从表面的 `as const` 到深层的类型推断知识不足，从表面的命名不统一到深层的单开发者迭代模式，从表面的静默吞错到深层的防御性设计哲学不成熟——**核心问题是代码工程化阶段低于类型系统复杂度**。

---

## Step 4 — 验证（知行合一）

### 4.1 逻辑一致性检查

- **A1 的修复副作用**：去除 `as const` from `_numZero` → `dft` 参数类型恢复为 `number`。4 个函数的调用方（测试 + 外部）需要检查是否有依赖字面量 `0` 类型的代码。当前测试中 `toNum(null, -1)` 是唯一触发此 bug 的用例。✅
- **A2 的修复副作用**：将 `notEmptyAry` 的 second param 改为 `guard?: TypeGuard<T>` → 与 `aryGuard` 的 API 形态一致。需要同时修复 JSDoc。✅
- **A3 的修复**：`exp?: number` → `exp?: number | null` 或者显式处理 null（抛异常/返回 NaN）。建议后者（更严格）。⚠️ 需决策
- **B1 的破坏性**：重命名所有 guards 导出，需同步更新 8 个测试文件 + index.ts 的 barrel export。全项目搜索无外部调用方（当前只有 core 子包）→ 破坏性范围可控。✅
- **C1 的破坏性**：收紧 `isStr` → 需要清理 `string.test.ts` 中 6+ 个包装对象/代理对象测试。如果 `@meld-ts/core` 尚未发布或被使用，破坏性可控。✅

### 4.2 交叉验证

- deepseek 的 N1（decimalAdjust exp 类型）与 opus 的 A1（_numZero as const）属于**同类模式**：类型标注和运行时行为不匹配。两个独立审查者殊途同归地发现了同一种 root cause 的不同实例，增强了对根因诊断的信心。✅
- deepseek 的 N3（aryGuard 空数组）与 opus 的 A2（notEmptyAry 类型推断）形成**对称补充**：opus 关注"有 guard 时推断失败"，deepseek 关注"推断成功但结果有陷阱"。✅
- deepseek 的 N5（calcProgress 不对称）与 opus 的 C4（calcProgress NaN value）**重叠但视角不同**：opus 定位 fact（"value 完全未校验"），deepseek 定位本质（"异常处理不对称是防御性哲学不成熟的症状"）。互补而非重复。✅

### 4.3 边界条件

- **修复后 ts-check 是否全绿**：A1 + A2 + A3 + A4 修复后，`tsgo --noEmit` 应全绿。但我不确定是否还有其他隐藏的类型错误（因为我的环境无法跑 tsgo）。opus 的审查可能覆盖了所有 tsgo 报错。⚠️ 需实测
- **修复后测试是否全过**：A4（导入名不匹配）修复后，`bun test` 应全过。B1 的重命名需要同步更新测试导入。C1 的 `isStr` 收紧需要清理测试。⚠️ 需实测
- **安全性**：修复后 `isPromise` 的 thenable 注入风险仍然存在（C6，不是 isPromise 自己能解决的）。需要在文档中警示。

### 4.4 未竟之处（诚实声明）

以下问题我因为 shell 不可用而**无法实证**，只能逻辑推导：

- `tsgo --noEmit` 是否还有其他隐藏的类型错误？
- `bun test` 在修复 A4 后是否全绿？
- `number.test.ts` 中的 `isNumberVal('  123  ')` 测试——当前实现 `isNumVal` 没有 trim 处理，`parseFloat('  123  ')` 返回 123，所以能通过。但这是 parseFloat 的隐式行为，应文档化。
- `cloneObj` 在 Deno/Bun/Node 不同环境的 behavior 差异——`structuredClone` 的实现是否有边界差异？

---

## 附录：问题速查表

| 级别 | 编号 | 简述 | 修复优先级 | 破坏性 |
|------|------|------|-----------|--------|
| A | A1 | `_numZero as const` 污染 dft 参数类型 | 🔴 紧急 | 低 |
| A | A2 | `notEmptyAry` 的 guard 无类型推断 | 🔴 紧急 | 低 |
| A | A3 | `decimalAdjust` exp 类型与行为不一致 | 🔴 紧急 | 低 |
| A | A4 | `number.test.ts` 导入名不匹配 | 🔴 紧急 | 低 |
| B | B1 | 命名分裂 | 🟡 建议修 | 中 |
| B | B2 | `_internal.ts` 语义污染 | 🟡 建议修 | 低 |
| B | B3 | `WithPrototype` 公开导出 | 🟡 建议修 | 中 |
| B | B4 | `isPromise` 可选链冗余 + catch 非 A+ | 🟡 建议修 | 低 |
| B | B5 | `limitNumMinMax` 三元嵌套 | 🟡 建议修 | 低 |
| C | C1 | `isStr` 宽松定义 | 🟢 需拍板 | 高 |
| C | C2 | 缺失 `isFn` | 🟢 需拍板 | 低 |
| C | C3 | `cloneObj` JSON 降级静默数据丢失 | 🟢 需拍板 | 低 |
| C | C4 | `calcProgress` value 无校验 | 🟢 需拍板 | 低 |
| C | C5 | `aryGuard` 空数组陷阱 | 🟢 文档 | 无 |
| C | C6 | `isPromise` thenable 注入风险 | 🟢 文档 | 无 |
| C | C7 | `not` 返回类型不收窄 | 🟢 接受现状 | 无 |
| C | C8 | `toBool` 对 `isStr` 的耦合 | 🟢 随 C1 自动解 | 无 |

---

> **格物结论**：opus 审查 + deepseek 审查 = 两个独立模型，两套认知框架，交叉验证了核心诊断。主要矛盾是类型契约的系统性裂缝，次要矛盾是防御性设计的哲学不成熟。修复路线图清晰：先修 A 级（4 项，让 ts-check 变绿 + 测试能跑），再统一 B 级（5 项，提升代码健康度），C 级需要作者决策。

> — KAI@AI-SOUL.deepseek
> deepseek-v4-pro / 2026-06-12 / 格物五步螺旋
