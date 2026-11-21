# `@meld-ts/core/a11y` 设计稿

> 状态：草稿，已按审查 01、02 修订（修订内容见 §12）。只写类型模型、API、目录和测试方案，不写实现。
> §11 的待定项如果没有新的决定，实现时按「建议」一栏执行。

## 1. 要解决的问题

AI 用 devtools 测页面时，靠的是 a11y 树里的 role 和名字；但它写代码时不会主动补 a11y。遇到没名字的节点，它退回用 uid 或脚本点击，测试照样通过，流程里没有任何东西逼它回头修。

能在写代码那一刻就逼住它的只有类型：`a11y(role, props)` 按 role 约束「必须有什么、允许有什么」，输出一个类型精确的属性对象；再配一条 AGENTS 规则：非原生 role 一律走 `a11y()`，不许手写 `role=` / `aria-*`。

还有一个容易忽略的后果：`a11y()` 的输出是用 spread 写进 JSX 的（`<div {...a11y('switch', {...})} />`）。jsx-a11y 这一类规则只读 JSX 里字面写出来的 `role=` 和 `aria-*`，看不到 spread 里的内容。也就是说，改用 `a11y()` 以后，lint 对这些属性就不再检查了，**原来 lint 做的检查，要由类型接过来**。这是 §2 要按 lint 分表的原因。

现有库都没做到「输出类型精确」：

- `aria-attribute-types`：按 role 限定了允许的属性，但全部可选（switch 的 `aria-checked` 不写也不报错），转换函数返回 `Record<string, unknown>`。
- `@opensourceframework/react-a11y-utils`：工厂函数大多返回同一个宽泛的 `AccessibilityProps`，合并后类型丢失，也不和 role 绑定。

## 2. 为什么按 lint 分表

### 四个 lint 的规则表确实不一样（实测）

用同一份 fixture（aria-query 5.3.2 的 127 个非抽象 role，每个 `<div role="x" tabIndex={0} />`）跑四个 lint 的「必填属性」规则：

| role | eslint-plugin-jsx-a11y | bun lint | oxlint | biome |
|---|---|---|---|---|
| combobox | controls, expanded | controls, expanded | controls, expanded | expanded |
| option | selected | selected | selected | — |
| treeitem | selected | selected | — | — |
| separator（可聚焦） | — | — | — | valuenow |

其余 role（checkbox、switch、slider、heading、radio、scrollbar 等）四家一致（没有全量复测）。

版本：eslint-plugin-jsx-a11y 6.10.2、bun 1.4.5 canary、oxlint 1.94.0、biome 2.6.8。eslint、oxlint、biome 这三列审查时复测过，结果一致；bun 那列没复测。

另外几点实测结论：

- **bun lint 的 jsx-a11y 是 eslint 版的移植**，消息文本和结果都一致。但 `bun lint` 目前只在 canary（1.4.5）里有，1.4.4 正式版没有这个命令。
- **oxlint 一次报全部缺失属性**：1.94.0 对 combobox 一条消息里同时报 `aria-controls` 和 `aria-expanded`。之前记录的「一次只报一个」没有复现，已删除。探针仍然循环补属性直到不再报错（§6），这样不依赖任何一家的报告方式。
- **biome 的规则看上下文**：separator 只有可聚焦（带 tabIndex）时才要求 `aria-valuenow`。纯按 role 建表会漏掉这类条件。
- **lint 看不到 spread**：`<div {...p} />` 里没有字面 role，lint 什么都不报。

### 结论

lint 看不到 `a11y()` 的输出，所以类型要替项目的 lint 把关；替谁把关，就按谁的表来。四家的表有实质差异，而且只能从 lint 本身测出来，不能凭规范手写。同一个 lint 换个版本，表也可能变，所以还要能按用户项目里的版本重新测（§6）。

只按 ARIA 规范出一张严格表，会要求一些项目 lint 根本不要求的属性（比如 biome 用户的 combobox 被要求写 `aria-controls`）。要这种严格程度的，可以用多 lint 合并（§4）。

## 3. API

```ts
// src/a11y.ts：项目里只在这一个文件配置
import { createA11y } from '@meld-ts/core/a11y';

export const a11y = createA11y({ lint: 'biome' });
```

```ts
import { a11y } from '@/a11y';

a11y('switch', { checked: true, label: 'Wi-Fi' });
// 类型：{ readonly role: 'switch'; readonly 'aria-checked': true; readonly 'aria-label': 'Wi-Fi' }

a11y('switch', { label: 'Wi-Fi' });
// ✗ 类型错误：缺少 checked

a11y('img', { checked: true, label: '头像' });
// ✗ 类型错误：img 不支持 checked

a11y('img', { lable: '头像' });
// ✗ 类型错误：没有 lable 这个属性

a11y('img', {});
// ✗ 类型错误：img 必须有名字，label / labelledBy 至少一个

a11y('separator', { focusable: true, valueNow: 50 });
// biome 下：可聚焦的 separator 必须有 valueNow
// 类型：{ readonly role: 'separator'; readonly tabIndex: 0; readonly 'aria-valuenow': 50 }

a11y.aria({ expanded: open, controls: menuId });
// 给原生元素补状态，不带 role：{ readonly 'aria-expanded': boolean; readonly 'aria-controls': string }
```

### `createA11y(options)`

```ts
createA11y({ lint: 'biome' });                                // output 默认 'react'
createA11y({ lint: ['biome', 'oxlint'], output: 'html' });    // 多个 lint 合并
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `lint` | `A11yLintName \| readonly A11yLintName[]` | 用哪张规则表。传数组就在类型层合并（§4）。只影响类型，运行时不读 |
| `output` | `'react' \| 'html'`，默认 `'react'` | 值的输出形式（下表） |

不需要写泛型：`lint` 用 `const` 类型参数推出字面量，`output` 不传时取默认值。

返回值是一个可调用的 `a11y`，名字和 `createA11y` 对得上：

- `a11y(role, props)`：没有原生元素可用、或确实需要自定义 role 时用。
- `a11y.aria(props)`：原生元素补状态用，不带 role。

### 为什么分两个入口

只给 `a11y()` 一个入口，AI 想给 `<button>` 补 `aria-expanded` 时，很可能写成 `<button {...a11y('button', {...})}>`。多出来的 `role="button"` 是冗余的，而 lint 看不到 spread，`noRedundantRoles` 也拦不住。所以要给原生元素一个不带 role 的入口，再用 AGENTS 规则（§8）说清楚两个入口各管什么。

`a11y()` 的 role 范围不排除有原生元素的 role（button、img、separator……）：`<div role="button">` 在有些场景确实需要，类型挡掉会逼人绕路。

### `a11y.aria()` 允许哪些属性

所有 ARIA 属性都允许，只检查取值类型。原因：一个属性能不能用，取决于元素的隐式 role（`<button aria-expanded>` 合法，`<div aria-expanded>` 不合法），而 `aria()` 不知道元素是什么。这是已知缺口，和 §10「不做元素和 role 的搭配」是同一件事。

### 输入写法

不带 `aria-` 前缀的 camelCase：`checked`、`labelledBy`、`valueNow`。

ARIA 属性名本身没有内部连字符，所以输出键名就是 `` `aria-${Lowercase<K>}` ``，类型层面不需要查表。

引用 id 的属性分两种，按 aria-query 里的类型（`idlist` / `id`）生成，不手写：

- idlist：`labelledBy`、`describedBy`、`controls`、`owns`、`flowTo`。接受 `string | readonly string[]`，输出时用空格拼接。
- id：`details`、`errorMessage`、`activeDescendant`。只接受单个 `string`，拼成 `'a b'` 就是非法值。

`focusable: true` 不是 ARIA 属性：它输出 `tabIndex`（见下表），同时打开这个 role 在可聚焦时的额外必填项（§4）。不要另外手写 `tabIndex`，否则两边会漂。

- `focusable` 只接受 `true`，或可能是 `undefined` 的变量。变量类型里含 `true`，就按可聚焦来要求额外必填项，宁可多要求；这时输出里的 `tabIndex` 是可选键。
- 不支持 `focusable: false`。不可聚焦就不写 `focusable`。
- 需要 `tabIndex={-1}`（只能用脚本聚焦、不进 Tab 顺序）时，手写 `tabIndex={-1}`，AGENTS 规则对它放行（§8）。

### output：值的输出形式

| 输入 | `output: 'react'` | `output: 'html'` |
|---|---|---|
| `checked: true` | `'aria-checked': true` | `'aria-checked': 'true'` |
| `checked: false` | `'aria-checked': false` | `'aria-checked': 'false'` |
| `checked: isOn`（`boolean` 变量） | `boolean` | `'true' \| 'false'` |
| `checked: 'mixed'` | `'mixed'` | `'mixed'` |
| `level: 2` | `'aria-level': 2` | `'aria-level': '2'` |
| `controls: ['a', 'b']` | `'a b'` | `'a b'` |
| `focusable: true` | `tabIndex: 0` | `tabindex: '0'` |
| `hidden: undefined` | 键不出现 | 键不出现 |

输出类型跟着 output 走：`html` 下 `true` 变成字面量 `'true'`，`2` 变成 `` `${number}` ``。

可选属性的值类型含 `undefined` 时（比如传进来的是 `boolean | undefined` 变量），输出里这个键是可选的，和运行时「undefined 不输出」一致。

必填属性不接受 `undefined`：变量可能是 `undefined` 时，类型直接报错，要先给默认值（`checked: isOn ?? false`）。AI 常把状态变量直接传进来，这条是有意的。

### 开了 `isolatedDeclarations` 的项目

`isolatedDeclarations` 要求导出的变量有显式类型，`export const a11y = createA11y(...)` 会报 TS9010（core 自己的 tsconfig 就开了）。为此导出类型辅助 `A11yOf<O>`：

```ts
const options = { lint: 'biome' } as const;   // 不要加 satisfies，会让这一行也报 TS9010
export const a11y: A11yOf<typeof options> = createA11y(options);
```

（已用 TypeScript 7.0.2 和 5.9.3、开 `--isolatedDeclarations` 实测通过，见附录 A。）

## 4. 类型模型

### 数据分两类

| 数据 | 来源 | 放在哪 | 分不分 lint |
|---|---|---|---|
| 每个 role 的必填属性、允许属性、可聚焦时的额外必填 | lint 探针 | `src/a11y/lints/<lint>.ts` | 分 |
| 属性取值类型、禁止属性、名字规则、引用 id 的属性 | aria-query | `src/a11y/aria.generated.ts` | 不分 |

lint 只测得出前一类。禁止属性（`prohibitedProps`）和名字规则（`nameFrom`、`accessibleNameRequired`）是 aria-query 里现成的数据，不经过 lint。

生成时，每张 lint 表的「允许属性」会先减去 aria-query 的禁止属性。所以类型里不需要单独的 `prohibited`：不在允许集合里的属性一律报错，禁止属性自然也在其中。

### 一张 lint 规则表

```ts
/** 一张规则表：某个 lint、某个版本下的规则。由探针生成，不手写。 */
type A11yProfile = {
  readonly meta: {
    readonly lint: A11yLintName;
    readonly version: string;
    readonly source: 'builtin' | 'probe' | 'merged';   // core 自带 / 用户项目里探针生成的 / 多 lint 合并的
    readonly aliasOf?: A11yLintName;                   // 这张表直接沿用另一个 lint 的表（见 §6 bun）
  };
  readonly roles: {
    readonly [R in A11yRole]: {
      readonly required: AriaKey;                // 必填
      readonly supported: AriaKey;               // 允许（含 required），已减去禁止属性
      readonly requiredWhenFocusable: AriaKey;   // 可聚焦时额外必填；没有就是 never
    };
  };
};
```

`meta` 不参与约束，只为鼠标悬停时能看出当前生效的是哪一份、哪个版本。

`EslintA11yProfile`、`BunA11yProfile`、`OxlintA11yProfile`、`BiomeA11yProfile` 就是四个生成出来的 `A11yProfile` 字面量类型。

### aria-query 生成的数据

```ts
/** camelCase 的 ARIA 属性名，如 'checked' | 'labelledBy' | 'valueNow' ……（输入用的名字） */
type AriaKey = /* 生成 */;

/** 每个属性的取值类型，如 AriaValue<'checked'> = boolean | 'mixed' */
type AriaValue<K extends AriaKey> = /* 生成 */;

/** 引用多个 id 的属性：值是 string | readonly string[]，输出时空格拼接（aria-query 类型为 idlist） */
type AriaIdListKey = 'labelledBy' | 'describedBy' | 'controls' | 'owns' | 'flowTo';

/** 引用单个 id 的属性：值只能是 string（aria-query 类型为 id） */
type AriaIdKey = 'details' | 'errorMessage' | 'activeDescendant';

/** 每个 role 的名字规则 */
type A11yNameRule = { readonly [R in A11yRole]: 'required' | 'optional' | 'prohibited' };
```

名字规则从 aria-query 推出：

- `required`：`accessibleNameRequired` 为 true，且 `nameFrom` 不含 `contents`（名字只能由作者给，比如 img）。
- `prohibited`：`nameFrom` 含 `prohibited`（比如 generic）。label / labelledBy 不能用：生成 lint 表时，这类 role 的 supported 里一并减掉 `label` 和 `labelledBy`。
- 其余是 `optional`。`nameFrom` 含 `contents` 的 role，名字可能来自子元素，类型看不到子元素，所以不强制。

注意 aria-query 里 `nameFrom` 是数组（127 个 role 里：88 个 `['author']`、24 个 `['author','contents']`、14 个 `['prohibited']`、1 个 `['none']`），按上面的规则归成三类，不要直接搬成单值。

### 注册表：内置 + 重载

core 自带四个 lint 的表；用户项目里的 lint 版本不一样时，用探针生成的表盖掉对应那一份。

TypeScript 的接口合并不允许改已有属性的类型：core 里写了 `biome: BiomeA11yProfile`，用户再声明一个类型不同的 `biome` 会直接报错。所以拆成两个接口，再合成一份生效的：

```ts
/** core 内置：发版时用 core 锁定的 lint 版本探测生成（src/a11y/lints/） */
export interface A11yBuiltinLints {
  eslint: EslintA11yProfile;
  bun: BunA11yProfile;
  oxlint: OxlintA11yProfile;
  biome: BiomeA11yProfile;
}

/** 留给使用方重载。core 里永远是空的，用户项目里探针生成的文件往这里登记 */
// biome-ignore lint/suspicious/noEmptyInterface: 留给使用方用 declaration merging 重载
export interface A11yLintOverrides {}

export type A11yLintName = keyof A11yBuiltinLints;

/** 实际生效的表：有重载、且结构对，用重载；否则用内置 */
export type A11yLints = { [K in A11yLintName]: CheckOverride<K> };
```

- 生效的名字只有 `A11yBuiltinLints` 里的四个。
- 两个接口都必须是 interface，type 别名不能合并。
- **重载写错了要报得出来。** 两种错：键名不是四个内置名之一（比如拼成 `biom`），或者值的结构不是 `A11yProfile`。这两种情况都在 `createA11y(...)` 的参数上报错，错误信息里直接写原因（`Unknown lint name in A11yLintOverrides`、`Invalid A11yLintOverrides shape, rerun meld a11y probe`）。不能让它静默退回内置表，也不能让错误炸在 `a11y()` 调用处的深层索引上。结构不对时，`A11yLints` 内部仍退回内置表，保证库自己的类型不跟着崩。定义见附录 A，两种错都实测过。错误信息用英文：中文属性名在 tsc 的报错里会被转成 `\uXXXX`，没法读。

用户项目里探针生成的文件长这样：

```ts
// 由 meld a11y probe 生成，勿手改。biome 2.4.0
export {};

declare module '@meld-ts/core/a11y' {
  interface A11yLintOverrides {
    biome: { meta: { lint: 'biome'; version: '2.4.0'; source: 'probe' }; roles: { /* ... */ } };
  }
}
```

**第一行的 `export {};` 不能省。** 没有它，这个文件是脚本，里面的 `declare module` 是在声明一个新模块，会把真正的 `@meld-ts/core/a11y` 整个盖掉，`createA11y` 等导出全部消失（审查实测）。有了它才是重载。

重载对打包后的 d.ts 也成立：bunup 可能把接口放进 chunk 文件，入口再用 `export { A as A11yLintOverrides } from './chunk-xxx.js'` 重命名转出。这种形状用 TypeScript 7.0.2 和 5.9.3 都实测过，重载照样生效。仍然要加一个针对构建产物的测试（§7）。

### 多个 lint 合并

`lint` 传数组时，在类型层把几张表合成一张：

| 字段 | 合并方式 |
|---|---|
| `required` | 并集 |
| `supported` | 交集 |
| `requiredWhenFocusable` | 并集 |

名字规则来自 aria-query，不分 lint，不需要合并。

合并后的 `meta`：`lint` 和 `version` 是参与合并的各表取值的联合，`source` 是 `'merged'`。类型操作是 `MergeProfiles` 和 `ResolveProfile`，定义见附录 A；`lint` 传单个名字时 `ResolveProfile` 直接取那张表，传数组时走 `MergeProfiles`。

合并后的输出保证数组里每个 lint 都过。要四家都过，就写 `lint: ['eslint', 'bun', 'oxlint', 'biome']`。

合并有一个前提：合并后 `required` 仍然是 `supported` 的子集。如果某个 lint 要求属性 X，另一个 lint 却不允许 X，合并后这个 role 就无法满足（X 既必填又是 never）。这种冲突要在内置表的类型测试里断言不存在（§7 第 1 层：任意两张内置表合并后，三条不变量都成立，见 §6）。

### 输入和输出

完整定义见附录 A。附录 A 是一份能跑的原型（规则表缩小到 4 个 role、2 个 lint），配一组断言，在 TypeScript 7.0.2 和 5.9.3 下都通过。实现时以它为准，这里只讲要点。

**输入**（`A11yInput` + 调用签名）：

- 必填属性 `-?`，值不接受 `undefined`；允许属性可选，值接受 `undefined`；`focusable?: true | undefined`；名字规则为 `required` 的 role，`label` / `labelledBy` 至少一个。
- 调用签名把三样交在 `props` 上：`I & Exact<I, 允许的键 | 'focusable'> & FocusRequirement<P, R, I>`。
- **为什么要 `Exact`**：`I` 是推导出来的泛型，TypeScript 对它不做多余属性检查。只写 `A11yInput` 的话，`a11y('img', { checked: true, label: 'x' })` 不会报错，拼错的 `lable` 也不会报错。名字被禁止的 role，`label` 也靠它挡：生成时已从 `supported` 里减掉。
- **`FocusRequirement` 的条件写成 `true extends I['focusable']`**：只要类型里含 `true` 就打开额外必填项，`true | undefined` 变量也算。不能写成 `I extends { focusable: true }`，那样含 `undefined` 的变量会判不中，额外必填整个失效（审查 02 实测）。也不能用 `infer` 从可选属性里取类型：TypeScript 会去掉其中的 `undefined`。

**输出**（`A11yAttrs`）：

- `role` 原样；`focusable` 变成 `tabIndex` / `tabindex`（`focusable` 可能为 `undefined` 时这个键可选）；其余键映射成 `` `aria-${Lowercase<K>}` ``。
- 值的类型含 `undefined` 的键变成可选键，值为字面量 `undefined` 的键去掉。
- `OutValue`：`react` 原样；`html` 下 `boolean` / `number` 转成模板字面量（`true` → `'true'`，`boolean` → `'true' | 'false'`，`2` → `'2'`）；idlist 数组一律是 `string`。

**`createA11y` 和 `A11yOf`**：

```ts
type A11yOptions = { readonly lint: A11yLintName | readonly A11yLintName[]; readonly output?: A11yOutputMode };

/** output 没写时取 'react'：Options['output'] 可能是 undefined，不能直接当 O 传 */
type OutputOf<Opt extends A11yOptions> = Opt['output'] extends A11yOutputMode ? Opt['output'] : 'react';

type A11yOf<Opt extends A11yOptions> = A11y<AsProfile<ResolveProfile<Opt['lint']>>, OutputOf<Opt>>;

declare function createA11y<const Opt extends A11yOptions>(options: Opt & OverrideKeyCheck): A11yOf<Opt>;
```

「不需要写泛型」靠的是 `const Opt`：`lint` 推成字面量或只读元组，`output` 不写时 `OutputOf` 取 `'react'`。`OverrideKeyCheck` 就是上面「重载写错了要报得出来」的那道检查；`AsProfile` 只是让合并结果满足 `A11yProfile` 约束。`output` 只接受确定的 `'react' / 'html'` 字面量：类型含 `undefined` 的变量（`out ?? 'react'` 收窄后可用）和收着整个 `A11yOptions` 的非泛型包装都会在调用点被 `OutputDefiniteCheck` 拦下——类型层承诺不了 react 还是 html，宁可报错（§12.4）。

## 5. 目录规划

```
src/a11y/
  index.ts                 子路径 @meld-ts/core/a11y 的入口：createA11y、类型、内置表。不导出 probe
  createA11y.ts            运行时：值转换、id 数组拼接、跳过 undefined、focusable → tabIndex
  createA11y.test.ts
  types.ts                 A11yProfile、A11yInput、A11yAttrs、AriaAttrs、OutValue、注册表接口和重载检查、
                           MergeProfiles、ResolveProfile、A11yOptions、A11yOf
  types.test.ts            类型测试（§7 第 1 层）
  aria.generated.ts        AriaKey、AriaValue、A11yRole、A11yNameRule、AriaIdListKey、AriaIdKey（从 aria-query 生成）
  lints/                   内置规则表，一个 lint 一个文件，整文件覆盖更新
    index.ts               汇总导出，声明 A11yBuiltinLints
    eslint.ts
    bun.ts
    oxlint.ts
    biome.ts
  probe/                   探针。只在 node 里跑，不进 a11y 入口和 browser 包
    index.ts               probe({ cwd, lints, exec? }) → 各 lint 的规则表数据
    detect.ts              从 cwd 找出装了哪些 lint、解析二进制和版本
    fixtures.ts            生成 fixture：required、supported、可聚焦差异、自检
    samples.generated.ts   每个 AriaKey 的合法样例值（从 aria-query 生成），探针和 §7 第 2 层共用
    exec.ts                启动子进程的那一层，可注入，方便测试打桩
    runners/               一个 lint 一个文件：写配置、跑 lint、按规则 id 解析 JSON 输出
      eslint.ts
      bun.ts
      oxlint.ts
      biome.ts
    serialize.ts           规则表数据 → TS 类型字面量（两种模式共用）
    emit-override.ts       用户模式：写重载文件（第一行固定 export {};）
    *.test.ts              解析器、fixture、序列化、模板的单测
src/bin/
  meld.ts                  bin 入口，子命令路由。a11y probe 走用户模式

scripts/
  a11y-sync.ts             维护者模式：建 lab、装 lint、调 probe、写 src/a11y/lints/ 和 aria.generated.ts
  a11y-lint-test.ts        §7 第 2、3 层：在 lab 里跑一致性测试和反向测试

bunup.bin.ts               bin 单独一份打包配置（见 §9）

.cache/a11y-lab/           a11y-sync 建的空项目（.cache 已在 .gitignore 里）
```

几点说明：

- **生成文件只含类型。** `aria.generated.ts` 和 `lints/*.ts` 里只有 `type` / `interface`，没有运行时值。`src/browser/index.ts` 会 `export *` 所有子路径，有运行时值就会被打进 iife。运行时只需要 `createA11y.ts` 里一张很小的表：`AriaIdListKey` 那 5 个键，用来判断哪些值要空格拼接。
- `lints/*.ts` 文件名不带 `.generated`，但头部写明「生成文件，勿手改」和 lint 版本。更新一个 lint 就整文件覆盖，diff 只落在这一个文件里。
- `probe/` 放在 `src/a11y/` 下面，但 `src/a11y/index.ts` 不导入它，所以 `@meld-ts/core/a11y` 和 browser 包里都没有 node 依赖。
- 维护者模式的输出（每个 lint 写一个 `.ts`）放在 `scripts/a11y-sync.ts`，不随包发布；它和用户模式共用 `serialize.ts`。
- **样例值只有一个来源。** 探测 supported 时要给每个属性造一个合法值，§7 第 2 层写 fixture 时也要。这份数据和 `aria.generated.ts` 一样从 aria-query 生成（`probe/samples.generated.ts`），不手写，免得类型更新了样例没跟上。它是运行时值，只被 probe 和 scripts 引用，不进 a11y 入口。

## 6. 探针：两种模式

探针核心只有一个：`probe({ cwd, lints })`，在 `cwd` 这个项目里用它自己装的 lint 跑 fixture，返回规则表数据。两种模式的区别在于 cwd 是谁、结果写到哪。

| | 用户模式 | 维护者模式 |
|---|---|---|
| 谁用 | 用 core 的项目 | core 自己 |
| 怎么跑 | `meld a11y probe`（随包发布的 bin） | `bun run a11y:sync`（仓库脚本，不发布） |
| cwd | 用户项目根目录 | `.cache/a11y-lab/`，脚本临时建的空项目 |
| lint 版本 | 用户项目装的什么就是什么，可能是旧版 | 最新版 |
| 输出 | 一个重载文件 | `src/a11y/lints/<lint>.ts`，一个 lint 一个 |

### 工作目录

探针在 `<cwd>/.meld-a11y-probe/` 下工作，跑完删掉（`--keep` 保留，用来排查）：

```
.meld-a11y-probe/
  config/
    eslint/eslint.config.js
    oxlint/.oxlintrc.json
    biome/biome.json
  fixtures/
    *.jsx
```

为什么这样放（都实测过）：

- **不能放 `node_modules/.cache/`**：biome 和 eslint 默认忽略 node_modules，显式传路径也不检查，结果是一张静默的空表。
- **不能放系统临时目录**：eslint 配置要 `import` 项目里的 eslint-plugin-jsx-a11y，配置文件得在项目目录里，模块解析才找得到。
- **配置和 fixture 分开放**：biome 的配置文件如果在 fixture 的上级目录，会被当成嵌套的 root 配置，和项目自己的 biome.json 冲突报错。分开放、用 `--config-path` 显式指定，项目自己的 biome.json（哪怕 `files.includes` 只包含 `src/**`）也不影响。
- 每个 lint 都用 `-c` / `--config-path` 显式指定探针自己的配置，不读项目配置。

### 每个 lint 怎么跑

| lint | 启用的规则 | 命令 | 解析 |
|---|---|---|---|
| eslint | `jsx-a11y/role-has-required-aria-props`、`jsx-a11y/role-supports-aria-props` | `eslint -c config/eslint/eslint.config.js -f json fixtures/` | `messages[].ruleId` |
| oxlint | `plugins: ["jsx-a11y"]`，规则同上 | `oxlint -c config/oxlint/.oxlintrc.json -f json fixtures/` | `code` 形如 `jsx-a11y(role-has-required-aria-props)` |
| biome | `lint/a11y/useAriaPropsForRole`、`lint/a11y/useAriaPropsSupportedByRole`，其余规则关掉 | `biome lint --config-path=config/biome --reporter=json fixtures/` | `category` |
| bun | 第一版不探测（§11 第 4 条） | — | — |

- **只按规则 id 白名单取数**，不能按「有没有报错」判断。同一份 fixture 会触发很多无关规则：oxlint 开了 jsx-a11y 插件后，`control-has-associated-label`、`prefer-tag-over-role` 默认也会报。
- 各 lint 的配置写法跟着版本走：biome 2.6.8 里 `recommended: false` 已标为 deprecated，runner 按检测到的版本选写法。
- 消息文本只在需要取属性名时解析（比如「缺哪些属性」），解析器针对每个 lint 单独写，用录好的真实输出做单测。

### 每个 lint 测三张表，再自检一次

1. **required**：每个 role 一个空元素，读「缺少哪些属性」；循环补上已报的属性再跑，直到不再报错。
2. **supported**：role × 每个 aria 属性，读「不支持」的报错，反推出允许集合。127 个 role × 约 50 个属性，约 6000 个元素，分批放进几个文件，一次跑完。
3. **可聚焦差异**：同一 role 加 / 不加 `tabIndex={0}` 各测一遍，差出来的就是 `requiredWhenFocusable`。

**自检**：表生成后，挑几个已知有必填项的 role（如 checkbox、switch、slider），故意少写一个必填属性，确认 lint 确实报错。不报错说明这个 lint 根本没跑起来规则（配置没生效、文件被忽略、解析失败），探针直接失败，不写文件。这一步在用户模式和维护者模式都跑。

**不变量**：写文件前，对每张表的每个 role 断言三条，任何一条不成立就失败，不写文件：

1. `required` ⊆ `supported`；
2. `requiredWhenFocusable` ⊆ `supported`；
3. 名字规则为 `required` 的 role，`label` 和 `labelledBy` 都在 `supported` 里。

不成立的典型原因是探针部分解析失败，或者减禁止属性减过头。后果是这个 role 的所有合法写法都会同时报「缺必填」和「never」，所以必须在生成时挡住。上面的自检只能证明 lint 跑起来了，证明不了这三条。

**bun 的表（第一版）**：`bun lint` 还只在 canary 里，第一版不探测，`lints/bun.ts` 直接沿用 eslint 的表，`meta` 写成 `{ lint: 'bun', version: <eslint-plugin-jsx-a11y 的版本>, source: 'builtin', aliasOf: 'eslint' }`。依据是上个会话测到「bun lint 是 eslint 版的移植，结果一致」，审查时没有复测。等 bun 正式版带上 `bun lint`，再加 runner 单独探测。

### 用户模式

```
meld a11y probe [--lint biome,oxlint] [--out ./a11y-lints.generated.d.ts] [--keep]
```

- `--lint`：不传就读项目的 package.json，装了哪些 lint 就探哪些。用户只用 biome，就只生成 biome 一份。
- `--out`：不传就生成到项目根目录的 `a11y-lints.generated.d.ts`。
- lint 从项目目录解析：biome、oxlint、eslint 和 eslint-plugin-jsx-a11y 都用项目 node_modules 里的；bun 用项目当前的 bun。
- 生成后检查输出文件在不在 tsconfig 的 `include` 里，不在就提示。不然重载不生效，用户还以为生效了。

规则配置用探针自带的，不读项目配置。这是取舍：测出来的是这个 lint 版本的默认规则，不是用户项目里实际开着的规则。

- 用户关掉了某条规则：类型照样按开着的来，只会多要求。
- 用户比默认多开了规则，或调严了参数：类型会比 lint 要求得少，这部分不覆盖。

所以准确的说法是：相对这个 lint 版本的默认规则，不会漏检。

生成文件不进 git 也不会出事：刚 clone 下来没跑探针，用的是 core 内置表，类型照样能用，只是版本可能对不上。要准确的话，用户把探针挂在 `prepare` 上，或者在 CI 的 `ts-check` 之前跑一次。

### 维护者模式

`bun run a11y:sync [--lint biome]` 做这几步：

1. 清空 `.cache/a11y-lab/`，在里面 `bun init -y`。
2. `bun add -d` 装最新的 eslint、eslint-plugin-jsx-a11y、@biomejs/biome、oxlint、aria-query。bun 第一版不探测，不用装。
3. 从 lab 里的 aria-query 生成 `src/a11y/aria.generated.ts` 和 `src/a11y/probe/samples.generated.ts`。
4. 以 lab 为 cwd 调 `probe()`，每个 lint 覆盖写 `src/a11y/lints/<lint>.ts`，头部写版本。
5. 对生成的文件跑 `biome format`。

`--lint` 只更新指定的 lint，其他文件不动。

core 的 devDependencies 不用装这四个 lint：它们只装在 lab 里。注意 core 自己用来 lint 源码的 biome（devDependencies 里的 `^2.5.0`）和 lab 里探测用的 biome 是两回事，版本可以不同，文档和生成文件头部写版本时别混。

## 7. 测试

费心思的地方在这里。分五层：

1. **类型测试**（`types.test.ts`）：附录 A 的断言是起点，扩到全部内置表。每张表抽一组代表 role（switch、combobox、option、treeitem、separator、img、heading、slider、generic），用 `@ts-expect-error` 断言这些都报错：缺必填、不支持的属性、拼错的键、禁止属性、缺名字、可聚焦时缺额外必填（`focusable` 传 `true` 和传 `true | undefined` 变量都要测）、必填键传 `boolean | undefined` 变量、id 类属性传数组。用类型相等断言检查输出精确：键集合、字面量值、output 差异（含 `false` 和 `boolean` 变量在 html 下的输出）、`focusable` → `tabIndex`、含 undefined 的键可选。另外测：
   - 注册表：在测试里重载 `A11yLintOverrides`，断言生效的是重载后的表；键名拼错、结构不对，`createA11y` 报错；
   - 多 lint 合并的结果，以及任意两张内置表合并后三条不变量都成立（§6）；
   - `A11yOf` 在 `isolatedDeclarations` 下可用。

   这一层靠 `tsc` 检查，`bun test` 单跑不会报类型错误。要确认 tsconfig 覆盖了测试文件，并且 pre-push / CI 里 `ts-check` 和 `test` 都跑。类型测试要在 core 声明的 TypeScript 版本（`^7`）下跑；附录 A 在 7.0.2 和 5.9.3 下结果一致。
2. **lint 一致性测试**（核心）：对每张表、每个 role，用 `a11y()` 生成三种输出：「只带必填」「带全部允许属性」，以及有 `requiredWhenFocusable` 的 role 再加一种「`focusable: true` + 全部允许属性」（biome 的 separator + valuenow 就靠这一种验）。属性值来自 `samples.generated.ts`。输出**展开成字面属性**写进 JSX fixture（`<div role="switch" aria-checked="true" ...>`），交给对应 lint 跑，要求相关规则零报错。不能用 spread 写 fixture：lint 看不到 spread，测试会永远全绿。四家合并的结果要四个 lint 都跑一遍。
3. **反向测试**：对每个 role 故意去掉一个必填属性，确认对应 lint 确实报错。防止探针解析失败时生成了一张「什么都不要求」的空表，第 2 层还照样全绿。
4. **构建产物的重载测试**：`bun run build:dist` 之后，在临时项目里通过包名引用构建产物，写一个带 `export {};` 的重载文件，跑 `tsc`，断言重载生效；再去掉 `export {};` 跑一次，断言失败。防止打包方式变了以后重载悄悄失效。
5. **运行时单测**：output 转换、id 数组拼接、undefined 跳过、focusable → tabIndex；探针的解析器、fixture 生成、序列化、重载模板（断言第一行是 `export {};`）用录好的 lint 输出做单测。`exec.ts` 可注入，runner 和 detect 的子进程、读文件部分用桩替换。保持仓库的 100% 覆盖率。

第 2、3、4 层不进 `bun test src/`：第 2、3 层在 lab 里跑（`bun run test:a11y-lint`），跑之前按 `lints/*.ts` 头部记的版本重建 lab，保证测的就是提交进仓库的那几个版本；第 4 层依赖构建，放在发版前的检查里。

漂移检查：定时跑一次 `a11y:sync`，`git diff src/a11y/lints/` 有变化就说明 lint 出了新版、规则变了，提示更新。

## 8. AGENTS 规则（草案）

```
- 能用原生元素就用原生元素（button、a、input、select、dialog…）。
- 原生元素补状态用 a11y.aria({...})，不手写 aria-*，也不要对原生元素用 a11y(role, ...)。
- 自定义 role 一律用 a11y(role, {...})，不手写 role= 和 aria-*。
- 需要可聚焦就传 focusable: true，不另外手写 tabIndex。唯一例外：只能用脚本聚焦的元素手写 tabIndex={-1}。
- 项目统一从 src/a11y.ts 导入 a11y，这个文件里用 createA11y 绑定本项目的 lint 和 output。
```

lint 看不到 spread，这几条规则就是主要防线。「不手写」可以用 grep 在 CI 里检查，排除 `src/a11y.ts`：

```
rg --pcre2 '\b(role|aria-[a-z]+)\s*=(?!=)' --glob '*.{tsx,jsx}'
```

它能抓到 `role="x"`、`role = "x"`、`role={var}`、模板串等写法；也会误报普通代码里的 `role = ...` 赋值，按需加排除。抓不全的变形（比如先拼对象再 spread）靠 AGENTS 规则兜。

## 9. 和 core 的配合

- 子路径 `@meld-ts/core/a11y`，同步改 `bunup.config.ts`、`src/browser/index.ts`、`build:exports`、CLAUDE.md、README、SKILL.md。
- `src/browser/index.ts` 会把所有子路径合并进一个命名空间，所以导出名（含类型）不能和现有的撞：统一用 `A11y` 前缀，如 `A11yRole`、`A11yProfile`，不用 `Role`。`AriaKey`、`AriaValue`、`AriaInput` 这类 `Aria` 前缀的也要查一遍不撞名。
- 新增 bin，**单独一份 `bunup.bin.ts`**：入口 `src/bin/meld.ts`，只出 esm，带 shebang。不要加进 `bunup.config.ts`：那里导出的是单个对象，`bunup.exports.ts` 用 `{ ...config, exports: true }` 展开它；改成数组会让 `build:exports` 坏掉。`package.json` 加 `"bin": { "meld": "./dist/bin/meld.js" }`，`build` 脚本里串上 `build:bin`。确认 `build:exports` 生成的 `exports` 里没有把 bin 当成子路径。
- bin 和 probe 只用 node 内置模块，运行时仍然零依赖。
- 新增脚本：`build:bin`、`a11y:sync`、`test:a11y-lint`。
- `tsconfig.json` 的 `exclude` 加上 `.cache`：`.gitignore` 只挡 git，不挡 tsc，lab 里 `bun init` 生成的 `.ts` 会被拉进类型检查。`scripts/` 下的两个脚本要进 `ts-check`（tsconfig 没写 `include`，默认就会包含，不要排除）。
- 不依赖 React：输出是普通对象，`output` 只决定值的形式。

## 10. 不做的事

- 元素和 role 的搭配（`prefer-tag-over-role`、`no-noninteractive-element-to-interactive-role`），以及 `a11y.aria()` 的属性和元素是否搭配：要知道元素标签，`a11y()` 不知道。以后可以考虑 `a11y.on('div', 'switch', {...})`。
- 键盘交互、焦点管理：那是行为层（React Aria 那一类）的事。
- 文本内容能不能当名字（`nameFrom` 含 `contents` 的 role，名字可能来自子元素）：类型看不到子元素，这类 role 不强制 label。
- 读项目的 lint 配置：探针只测 lint 版本的默认规则（§6）。

## 11. 待定

| # | 问题 | 建议 |
|---|---|---|
| 1 | 命令名：`meld a11y probe`，还是单独叫 `meld-a11y`？ | `meld a11y probe`：`meld` 加子命令，以后别的功能也能挂上来 |
| 2 | 输入用 camelCase（`checked`），还是直接写 `aria-checked`？ | camelCase：短，而且 `labelledBy` 这种拼写容易错的地方有补全 |
| 3 | 要不要导出一个默认的 `a11y`（如四家合并 + `react`），让不想配置的人直接 `import { a11y }`？ | 先不导出，项目里写一行 `createA11y` 不费事，也逼着项目明确自己用哪个 lint |
| 4 | bun lint 目前只在 canary 里有：内置表现在就用 canary 生成 `bun.ts`，还是等正式版？ | 先让 `bun` 指向 eslint 那张表（两者结果一致），bun 正式版有 `bun lint` 后再单独探测 |

## 12. 修订记录

### 12.1 审查 01

审查 01 一共 15 条（Critical 2、Important 3、Medium 6、Minor 4），处理如下：

| 条目 | 结论 | 改在哪 |
|---|---|---|
| A1 不支持的属性不报错 | 采纳。加 `Exact`，同时挡住拼错的键 | §4 输入 |
| A2 重载文件缺 `export {}` 会盖掉子路径 | 采纳。模板第一行固定 `export {};`，加构建产物测试；chunk 重导出的形状已实测可重载 | §4 注册表、§7 第 4 层 |
| A3 lint 看不到 spread | 采纳事实，保留按 lint 分表：类型替 lint 把关，所以按项目 lint 的表来。重写两个入口的理由；一致性测试改成展开字面属性 | §1、§2、§3、§7 第 2 层 |
| A4 prohibited / nameFrom 没有探针来源 | 采纳。这两项来自 aria-query；`prohibited` 字段删掉，生成时从 supported 里减掉；名字规则归成三类 | §4 数据分两类 |
| A5 `aria()` 例子用了非全局属性 | 采纳。`aria()` 允许全部 ARIA 属性，写明已知缺口 | §3、§10 |
| B1 `isolatedDeclarations` 下编译不过 | 采纳。导出 `A11yOf`，已实测写法 | §3 |
| B2 `focusable` 没闭环 | 采纳。`focusable: true` 输出 `tabIndex`，可聚焦必填项进表，合并规则补上 | §3、§4 |
| B3 临时文件放 node_modules 会被忽略 | 采纳，并实测了新位置。改到 `<cwd>/.meld-a11y-probe/`，配置和 fixture 分开；加自检 | §6 |
| B4 规则清单没写、oxlint 行为没复现 | 采纳。补每个 lint 的规则 id 和命令；复测确认 oxlint 一次报全部，删掉旧说法；按规则 id 白名单解析 | §2、§6 |
| B5 bin 会破坏 `bunup.exports.ts` | 采纳。单独 `bunup.bin.ts` | §9 |
| B6 生成文件进 browser 包 | 采纳。生成文件只含类型 | §5 |
| C1 `a11y('button')` 没被挡住 | 不改类型，role 范围不收窄；理由写进 §3，靠 AGENTS 规则 | §3、§8 |
| C2 undefined 处理和表格不一致 | 采纳。含 undefined 的键可选 | §3、§4 输出 |
| C3 几个类型没定义 | 采纳。补上定义 | §4 |
| C4 测试和版本细节 | 采纳：类型测试靠 ts-check、`exec.ts` 可注入、biome 版本别混。旧版文件已删 | §6、§7 |

### 12.2 审查 02

审查 02 一共 17 条（Critical 2、Important 9、Minor 6），全部采纳。类型相关的改法都写进了附录 A 的原型，在 TypeScript 7.0.2 和 5.9.3 下跑过。

| 条目 | 改法 | 改在哪 |
|---|---|---|
| C1 options → P/O 的解析层缺失 | 补 `A11yOptions`、`OutputOf`、`ResolveProfile`、`createA11y` 签名；不写 output 时的 TS2344 已修 | §4 输入和输出、附录 A |
| C2 `focusable` 是 `true \| undefined` 变量时额外必填失效 | 条件改成 `true extends I['focusable']`；输出的 `tabIndex` 跟着变可选 | §3、§4、附录 A |
| I1 多 lint 合并没有类型操作 | 补 `MergeProfiles`，写明合并后的 `meta`；补合并冲突的不变量 | §4 多个 lint 合并、附录 A |
| I2 `FocusAttr` / `AriaAttrs` / `OutValue` 未定义 | 补定义；§3 表格补 `false` 和 `boolean` 变量 | §3、§4、附录 A |
| I3 undefined 规则和必填冲突 | undefined 规则收窄到可选属性；必填属性不接受 undefined | §3、§7 |
| I4 生成表缺不变量自检 | 生成时断言三条子集关系，不成立就不写文件 | §6 |
| I5 第 2 层测不到 `requiredWhenFocusable` | 加第三种 fixture | §7 |
| I6 样例值工厂没有位置 | 从 aria-query 生成 `probe/samples.generated.ts` | §5、§6 |
| I7 重载没有结构约束 | 键名和结构都在 `createA11y` 参数上报错，实测过 | §4 注册表、附录 A |
| I8 tsconfig 没排除 `.cache` | `exclude` 加 `.cache`；`scripts/` 进 ts-check | §9 |
| I9 实测版本和 peer `^7` 不一致 | 原型在 TypeScript 7.0.2 下复跑，chunk 重导出的重载也复跑了，结果和 5.9.3 一致 | §3、§4、§7 |
| M1 `focusable: false` / `tabIndex={-1}` | 不支持 `false`；`tabIndex={-1}` 手写，AGENTS 放行 | §3、§8 |
| M2 grep 漏网 | 换正则，加 `.jsx`，写明误报和漏网 | §8 |
| M3 bun 三处没对齐 | 第一版 `bun.ts` 沿用 eslint 表（`aliasOf`），§6 runner 和 lab 步骤同步改 | §4、§6 |
| M4 `details`、`errorMessage` 是单个 id | 拆成 idlist / id 两类，按 aria-query 生成；补上 `activeDescendant` | §3、§4、§5 |
| M5 示例注释和 const 推导不符 | `'aria-label': 'Wi-Fi'` | §3 |
| M6 「只会多要求」说满了 | 收窄到「相对默认规则」 | §6 |

审查 02 之外顺带发现的一点：core 的 `package.json` 写的是 `typescript: ^7`，但 `bun.lock` 里锁的是 5.9.3（typedoc 0.28 的 peer 只到 6.0.x），所以仓库现在跑 `ts-check` 用的其实是 5.9.3。这不是 a11y 的问题，单独处理。

### 12.3 附录 A 修订：r4 断言

附录 A r4 的原断言 `Eq<(typeof r4)['aria-expanded'], true | undefined>` 对 react 模式下的 `boolean | undefined` 输入过于乐观：tsc 5.9.3 实测推导是 `boolean | undefined`，字面量 `true` 不会凭空出现。实现不变（见 commit 1cd71a2 与 `docs/reviews/20261121-a11y-plan-a.md` 决定三），只把该行断言改为 `boolean | undefined`，已用 tsc 5.9.3 复测。

### 12.4 审查（round 4）

round 4 复审两条 Important 的裁定（其余条目为注释、死分支清理与文档计数，不涉及设计决定）：

| 条目 | 结论 | 改在哪 |
|---|---|---|
| `OutputOf` 是非分布判定：`output` 的类型是 `'html' \| undefined`（`output: out` 变量、直接收整个 `A11yOptions` 的非泛型包装）时静默取 `'react'`，运行时却按值走，类型承诺和实际输出会漂 | fail-closed：调用点新增 `OutputDefiniteCheck`（同 `OptionsKeyCheck` / `LintSelectionCheck`，挂在 `createA11y` 参数上），`output` 键存在且类型含 `undefined` 就报错——output 要么不写（键缺失不拦，默认 react），要么写确定的 `'react' / 'html'` 字面量，收窄掉 `undefined` 的变量（`out ?? 'react'`）可用。附录 A 的 `OutputOf` 不动，继续服务确定字面量的场景 | §4 输入和输出 |
| 附录 A 的 `A11yProfile` meta 写 `lint: string`、无 `aliasOf`，§4 和实现都是 `A11yLintName` | §4 胜：附录 A 自声明只是验证类型写法的缩小原型，不是字段类型的出处。附录 A 的 meta 两行改为 `A11yLintName`（含 `aliasOf?: A11yLintName`），「实现时以它为准」对这个字段不再误导 | 附录 A |

## 附录 A：类型原型（已实测）

规则表缩小到 4 个 role（switch、img、separator、combobox）、2 个 lint（biome、oxlint），aria 数据也是缩小版，只为验证类型写法。实现时把缩小的部分换成生成的数据。

验证方式：下面两个文件加一份 tsconfig（`strict`、`isolatedDeclarations`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`、`allowImportingTsExtensions`），用 TypeScript 7.0.2 和 5.9.3 跑 `tsc -p .`，都是 0 错误。`use.ts` 里每个 `@ts-expect-error` 都确实报了错（否则会报「未使用的 @ts-expect-error」）。另外两个错误场景（重载键名拼错、重载结构不对）各用一个临时项目验证过，都在 `createA11y` 处报出可读的错误。

### a11y.ts

```ts
// ---- aria-query 生成部分（缩小版） ----
export type AriaKey = 'checked' | 'expanded' | 'controls' | 'label' | 'labelledBy' | 'valueNow' | 'selected' | 'details' | 'hidden';
type AriaIdListKey = 'controls' | 'labelledBy';
type AriaIdKey = 'details';
export type AriaValue<K extends AriaKey> =
  K extends 'checked' ? boolean | 'mixed' :
  K extends 'expanded' | 'selected' | 'hidden' ? boolean :
  K extends 'valueNow' ? number :
  K extends AriaIdListKey ? string | readonly string[] :
  K extends AriaIdKey ? string : string;
export type A11yRole = 'switch' | 'img' | 'separator' | 'combobox';
type A11yNameRule = { switch: 'required'; img: 'required'; separator: 'optional'; combobox: 'required' };

// ---- 规则表 ----
type RoleRule = { readonly required: AriaKey; readonly supported: AriaKey; readonly requiredWhenFocusable: AriaKey };
export type A11yProfile = { readonly meta: { readonly lint: A11yLintName; readonly version: string; readonly source: 'builtin' | 'probe' | 'merged'; readonly aliasOf?: A11yLintName }; readonly roles: { readonly [R in A11yRole]: RoleRule } };
type Biome = { meta: { lint: 'biome'; version: '2.6.8'; source: 'builtin' }; roles: {
  switch: { required: 'checked'; supported: 'checked' | 'label' | 'labelledBy'; requiredWhenFocusable: never };
  img: { required: never; supported: 'label' | 'labelledBy' | 'details'; requiredWhenFocusable: never };
  separator: { required: never; supported: 'valueNow' | 'label' | 'labelledBy'; requiredWhenFocusable: 'valueNow' };
  combobox: { required: 'expanded'; supported: 'expanded' | 'controls' | 'label' | 'labelledBy'; requiredWhenFocusable: never };
} };
type Oxlint = { meta: { lint: 'oxlint'; version: '1.94.0'; source: 'builtin' }; roles: {
  switch: { required: 'checked'; supported: 'checked' | 'label' | 'labelledBy'; requiredWhenFocusable: never };
  img: { required: never; supported: 'label' | 'labelledBy' | 'details'; requiredWhenFocusable: never };
  separator: { required: never; supported: 'valueNow' | 'label' | 'labelledBy'; requiredWhenFocusable: never };
  combobox: { required: 'expanded' | 'controls'; supported: 'expanded' | 'controls' | 'label' | 'labelledBy'; requiredWhenFocusable: never };
} };
export interface A11yBuiltinLints { biome: Biome; oxlint: Oxlint }
// biome-ignore lint: 留给重载
export interface A11yLintOverrides {}
export type A11yLintName = keyof A11yBuiltinLints;
type CheckOverride<K extends A11yLintName> = A11yLintOverrides extends Record<K, infer O> ? (O extends A11yProfile ? O : A11yBuiltinLints[K]) : A11yBuiltinLints[K];
type UnknownOverrideKeys = Exclude<keyof A11yLintOverrides, A11yLintName>;
type BadShapeKeys = { [K in keyof A11yLintOverrides]: A11yLintOverrides[K] extends A11yProfile ? never : K }[keyof A11yLintOverrides];
type OverrideKeyCheck =
  & ([UnknownOverrideKeys] extends [never] ? unknown : { readonly 'Unknown lint name in A11yLintOverrides': UnknownOverrideKeys })
  & ([BadShapeKeys] extends [never] ? unknown : { readonly 'Invalid A11yLintOverrides shape, rerun meld a11y probe': BadShapeKeys });
export type A11yLints = { [K in A11yLintName]: CheckOverride<K> };

// ---- 多 lint 合并 ----
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type MergeProfiles<Ps extends A11yProfile> = {
  meta: { lint: Ps['meta']['lint']; version: Ps['meta']['version']; source: 'merged' };
  roles: { [R in A11yRole]: {
    required: Ps['roles'][R]['required'];                                   // 分布式并集
    supported: Intersect<Ps, R>;
    requiredWhenFocusable: Ps['roles'][R]['requiredWhenFocusable'];
  } };
};
type Intersect<Ps extends A11yProfile, R extends A11yRole> = Extract<AriaKey, UnionToIntersection<Ps extends unknown ? (k: Ps['roles'][R]['supported']) => void : never> extends infer F ? F extends (k: infer K) => void ? K : never : never>;
export type ResolveProfile<L> = L extends A11yLintName ? A11yLints[L] : L extends readonly A11yLintName[] ? MergeProfiles<A11yLints[L[number]]> : never;

// ---- 输入 ----
type Rule<P extends A11yProfile, R extends A11yRole> = P['roles'][R];
type NameRequirement<N> = N extends 'required' ? { label: string } | { labelledBy: string | readonly string[] } : {};
export type A11yInput<P extends A11yProfile, R extends A11yRole> =
  & { [K in Rule<P, R>['required']]-?: AriaValue<K> }
  & { [K in Exclude<Rule<P, R>['supported'], Rule<P, R>['required']>]?: AriaValue<K> | undefined }
  & { focusable?: true | undefined }
  & NameRequirement<A11yNameRule[R]>;
type Exact<I, Allowed extends PropertyKey> = { [K in Exclude<keyof I, Allowed>]: never };
type FocusRequirement<P extends A11yProfile, R extends A11yRole, I> =
  I extends { focusable: unknown } ? (true extends I['focusable'] ? { [K in Rule<P, R>['requiredWhenFocusable']]-?: AriaValue<K> } : unknown) : unknown;

// ---- 输出 ----
export type A11yOutputMode = 'react' | 'html';
type Str<V> = V extends readonly string[] ? string : V extends boolean | number ? `${V}` : V;
type OutValue<V, O extends A11yOutputMode> = V extends readonly string[] ? string : O extends 'html' ? Str<V> : V;
type AriaAttrs<I, O extends A11yOutputMode> = {
  readonly [K in keyof I as K extends string ? (undefined extends I[K] ? never : `aria-${Lowercase<K>}`) : never]: OutValue<I[K], O>;
} & {
  readonly [K in keyof I as K extends string ? (undefined extends I[K] ? ([I[K]] extends [undefined] ? never : `aria-${Lowercase<K>}`) : never) : never]?: OutValue<Exclude<I[K], undefined>, O>;
};
type TabKey<O extends A11yOutputMode> = O extends 'html' ? 'tabindex' : 'tabIndex';
type TabVal<O extends A11yOutputMode> = O extends 'html' ? '0' : 0;
type FocusAttr<I, O extends A11yOutputMode> = I extends { focusable: unknown }
  ? true extends I['focusable']
    ? undefined extends I['focusable']
      ? { readonly [K in TabKey<O>]?: TabVal<O> }
      : { readonly [K in TabKey<O>]: TabVal<O> }
    : {}
  : {};
export type A11yAttrs<R, I, O extends A11yOutputMode> = { readonly role: R } & FocusAttr<I, O> & AriaAttrs<Omit<I, 'focusable'>, O>;

export type A11y<P extends A11yProfile, O extends A11yOutputMode> = {
  <R extends A11yRole, const I extends A11yInput<P, R>>(role: R, props: I & Exact<I, Rule<P, R>['supported'] | 'focusable'> & FocusRequirement<P, R, I>): A11yAttrs<R, I, O>;
  aria<const I extends { [K in AriaKey]?: AriaValue<K> | undefined }>(props: I & Exact<I, AriaKey>): AriaAttrs<I, O>;
};
export type A11yOptions = { readonly lint: A11yLintName | readonly A11yLintName[]; readonly output?: A11yOutputMode };
type OutputOf<Opt extends A11yOptions> = Opt['output'] extends A11yOutputMode ? Opt['output'] : 'react';
type AsProfile<P> = P extends A11yProfile ? P : never;
export type A11yOf<Opt extends A11yOptions> = A11y<AsProfile<ResolveProfile<Opt['lint']>>, OutputOf<Opt>>;
export declare function createA11y<const Opt extends A11yOptions>(options: Opt & OverrideKeyCheck): A11yOf<Opt>;
```

### use.ts

```ts
import { createA11y, type A11yOf } from './a11y.ts';
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assert = <T extends true>(_?: T) => {};

const options = { lint: 'biome' } as const;
export const a11y: A11yOf<typeof options> = createA11y(options);
const both = createA11y({ lint: ['biome', 'oxlint'], output: 'html' });
const maybe: true | undefined = Math.random() > 0.5 ? true : undefined;
const on: boolean = Math.random() > 0.5;
const onOpt: boolean | undefined = Math.random() > 0.5 ? true : undefined;

const r1 = a11y('switch', { checked: true, label: 'Wi-Fi' });
assert<Eq<(typeof r1)['aria-checked'], true>>();
assert<Eq<(typeof r1)['aria-label'], 'Wi-Fi'>>();
assert<Eq<(typeof r1)['role'], 'switch'>>();
assert<Eq<Exclude<keyof typeof r1, 'role'>, 'aria-checked' | 'aria-label'>>();
// @ts-expect-error 缺 checked
a11y('switch', { label: 'x' });
// @ts-expect-error 不支持
a11y('img', { checked: true, label: 'x' });
// @ts-expect-error 拼错
a11y('img', { lable: 'x', label: 'y' });
// @ts-expect-error 缺名字
a11y('img', {});
// @ts-expect-error 可聚焦缺 valueNow
a11y('separator', { focusable: true });
// @ts-expect-error C2：focusable 是 true | undefined 变量，也要求 valueNow
a11y('separator', { focusable: maybe });
a11y('separator', { focusable: maybe, valueNow: 1 });
// @ts-expect-error I3：required 键不接受 undefined
a11y('switch', { checked: onOpt, label: 'x' });
a11y('switch', { checked: on, label: 'x' });
const r2 = a11y('img', { label: 'x', details: 'd' });
// @ts-expect-error M4：details 只收单个 id
a11y('img', { label: 'x', details: ['a', 'b'] });
const r3 = both('switch', { checked: true, label: 'x' });
assert<Eq<(typeof r3)['aria-checked'], 'true'>>();
// @ts-expect-error 合并：oxlint 要 controls
both('combobox', { expanded: true, label: 'x' });
both('combobox', { expanded: true, controls: 'm', label: 'x' });
// 合并：biome 要可聚焦 separator 的 valueNow
// @ts-expect-error
both('separator', { focusable: true });
const r4 = a11y.aria({ expanded: onOpt, controls: ['a', 'b'] });
assert<Eq<(typeof r4)['aria-controls'], string>>();
assert<Eq<keyof typeof r4, 'aria-expanded' | 'aria-controls'>>();
assert<Eq<(typeof r4)['aria-expanded'], boolean | undefined>>();
const r5 = a11y('separator', { focusable: maybe, valueNow: 2 });
assert<Eq<(typeof r5)['tabIndex'], 0 | undefined>>();
void r2;
```

