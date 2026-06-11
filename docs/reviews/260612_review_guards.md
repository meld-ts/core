# 格物 · @meld-ts/core - guards 深度审查

> KAI@AI-SOUL
> 2026年6月12日

## Step 0 — 格除先见

动手前，先列出我对这套代码的未经验证的预设，并将其搁置：

- 预设 A：「测试全过 = 代码健康」。但 `bun test` 不做类型检查，运行时绿 ≠ 类型契约正确。这个预设必须搁置。
- 预设 B：「类型守卫的 `val is T` 声明 = TS 真能推断出 T」。守卫的返回类型标注是断言，不等于调用点真实推断结果。必须实测。
- 预设 C：「core 工具库越全越好」。这是 trained association，会诱导我堆砌 `isXxx`。但 core 的价值在克制与正确，不在数量。
- 预设 D：「`as const` 是好习惯」。这是被反复强化的惯性，但放错位置会污染类型。

这四条暂时搁置，不让它们引导调查。

## Step 1 — 穷究（事实优先，已编译实证）

我没有停留在阅读，而是写了类型验证文件用 `tsgo --noEmit` 实跑。三个硬事实：

事实① `tsgo` 报错 `number.test.ts(57): Argument of type '-1' is not assignable to parameter of type '0'`：

```ts
export const _numZero = 0 as const;              // 类型是字面量 0
export const toNumber = (val: unknown, dft = _numZero) => { /* 省略 */ }
//                                     ^^^ dft 被推断为类型 `0`，而非 number
```
`as const` 让 _`numZero` 的类型坍缩为字面量 0，于是 `toNumber`、`limitNumberMin/Max/MinMax` **四个函数的 dft 参数类型全部被锁死为 0**——文档明明写着「默认值」，类型却禁止传入任何非零默认值。`toNumber(null, -1)` 类型不通过。

事实② tsgo 报错 `__typecheck_tmp.ts(9): Type 'unknown' is not assignable to type 'string'`：

```ts
if (notEmptyAry(value, isStr)) {
  const first: string = value[0];   // ❌ value 推断为 unknown[]，不是 string[]
}
// 对比组：
if (aryGuard(isStr)(value2)) {
  const first2: string = value2[0]; // ✅ 正确推断为 string[]
}
```

`notEmptyAry` 第二参数签名是 `guard?: (it: T) => boolean`，这不是类型守卫形态，TS 无法从 `isStr` 反推 `T = string`，T 退化为默认 unknown。而 array.ts 的 JSDoc 示例白纸黑字写着 `value[0].toUpperCase() // value is string[]`——文档撒谎。同文件的 aryGuard 用 `TypeGuard<T>` 形态，反而是对的。

事实③ 运行时实证 `new String('x')`：`typeof` 为 `object`、`=== 'x'` 为 `false`，但 `isStr` 声明 `val is string` 且测试断言其为 `true`。

## Step 2 — 辨析（透过现象看本质）

主要矛盾：这套代码的运行时正确性与类型契约正确性之间存在系统性裂缝。表层现象是「75 测试全过」，本质是测试只覆盖了 runtime 行为，type-level 的契约从未被纳入验证闭环。事实①②都是这条裂缝的产物——它们能潜伏至今，正因为 bun test 和 tsgo 是两套互不通气的检验。

**一分为二看 as const**：它的正面是「锁定字面量、防止意外修改」；反面是「类型坍缩、向上传染」。_`numZero` 作默认参数值时，反面压倒正面。同理 `_strEmpty = '' as const` 没出事，纯属偶然——因为它只用于返回值且函数有显式返回类型 string 兜底。不能把这次偶然当必然。

命名的普遍性与特殊性：`isStr/isBool/isAry/notEmptyStr/notEmptyAry` 走缩写，`isNumber/toNumber/isNumberVal` 走全称。core 是对外导出的公共契约，命名风格的不一致不是细节，是 API 的「口音分裂」——用户记不住到底该写 isNum 还是 isNumber。

**_internal.ts 的职责本质**：它原本是「typeof 返回值字符串常量」的集合（_typeStr 等），语义纯粹。我上一轮塞进去的 _strYes/_strNo/_strFalse 是 **toBool 的业务语义常量，与「typeof 常量」不是一类东西。这是我自己制造的语义污染，需自我批评。

## Step 3 — 致知（结论：分级问题清单）

去伪存真后，问题按严重度分三级：

### A 级 — 真 bug / 类型矛盾，必须修：

| # | 问题 | 本质 |
|---|------|------|
| A1 | `_numZero = 0 as const` 污染 4 个函数的 dft 参数类型 | 文档承诺 ↔ 类型禁止，且 ts-check 现已变红 |
| A2 | `notEmptyAry` 的 guard 无法推断 T，JSDoc 示例是错的 | 类型谎言写进了文档 |

### B 级 — 一致性 / 语义瑕疵，强烈建议修：

- B1 命名分裂：`Number` 全称 vs `Str/Bool/Ary` 缩写。需二选一统一（我倾向全称：isString/isBoolean/isArray，公共 API 可读性 > 省字符）。
- B2 _internal.ts 语义污染：`toBool` 的 yes/no/false 常量应就近放回 boolean.ts，_internal 只留 typeof 常量。
- B3 `WithPrototype` 是 `isCtor` 的内部辅助类型，不应在 types/index.ts 公开导出。

### C 级 — 设计权衡 / 欠缺，需你拍板：

- C1 `isStr` 把 `new String()` 包装对象判为 string（类型谎言）。运行时 `typeof` 为 object、`===` 比较恒 false。是否有意为之？ 若 core 面向现代代码，`new String()` 几乎绝迹，建议收紧为纯 `typeof === 'string'`，消除类型谎言。
- C2 缺失高频守卫 `isFn`——`isCtor` 内部已用 `typeof === 'function'` 却未独立暴露。这是最明显的缺口。其余 `isInt/isDate/isRegExp/isSymbol/isEmpty` 视 core 定位。
- C3 cloneObj 的 JSON → Object.assign 降级链：在有 structuredClone 的环境是永不执行的死代码（structuredClone 支持循环引用/Date/Map），无法被测试覆盖。防御老环境可保留，但需认知它是「信仰」而非「契约」。
- C4 `calcProgress` 对 `NaN` 的 value（非 total）静默返回 0，不抛错、无文档、无测试，且 value 完全未校验。

## Step 4 — 验证（知行合一）

- 逻辑一致性：A1、A2 均由 tsgo 实际编译报错确证，非推测。✅
- 事实拟合：A1 的连带后果——ts-check 脚本当前是红的（我上一轮加的 `toNumber(null, -1)` 测试触发），这恰好反向印证了 bug 真实存在，且证明「运行时绿 / 类型红」的主要矛盾成立。✅
- 边界条件：C1 的修改有破坏性——若现网真有依赖 `new String()` 判定的代码会受影响，但概率极低。C2 的范围取决于 core 定位，不能擅自膨胀（守住预设 C）。
- 未竟之处：B1 命名统一是破坏性变更，影响所有调用方，须你定夺方向后再动。

---

我的建议是立即修 A 级（A1 尤其紧急，否则 bun run ts-check 一直红），B 级和 C1/C2 需要你拍板。三个需要你决策的点：