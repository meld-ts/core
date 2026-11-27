# @meld-ts/core — AGENTS.md

## 项目概述

从 `@zenstone/ts-utils` 提炼的 TypeScript 核心工具库。零运行时依赖，
面向 Node.js（ESM + CJS）和 Browser（iife + esm）双平台。

贡献者：Jiankai Zeng、KAI@AI-SOUL、思源@AI-SOUL

## 目录结构

```
src/
  _internal/        # 内部常量与辅助（不对外导出）
  types/            # 核心类型：Constructor, TypeGuard, InferGuard, AnyFunction, ErrorLike
  guards/           # 类型守卫（string/number/boolean/array/object/function/error/symbol/existence/logicality）
  base/             # cloneObject 系列
  singleton.ts      # 单例工厂（同步 + 异步并发安全）
  timer.ts          # 前缀隔离的 setTimeout / setInterval 管理
  path.ts           # 可插拔安全策略的路径工具
  traits/           # Mixin 系统：implTraits / configurable / debuggable
  events/           # EventsEmitter（Promise.all 并发）/ linkEvents / createDelegator
  async/            # StatefulRpc / pending / retry / timeout / sleep
  browser/          # Browser 全量入口（iife.ts 全局变量 MeldTS + index.ts ESM）
  a11y/             # a11y 属性构造器：按 lint 规则表做类型约束（createA11y）
    probe/          # 维护者专用探针（a11y:sync 消费），不进 a11y 入口与 browser 产物
  bin/              # meld-ts CLI（a11y probe 路由与参数解析，独立打包到 dist/bin）
test/               # 构建/类型 fixture 与集成测试（test/a11y/*）
lint/               # 自定义 biome 插件（no-cross-file-reexport）与它的 fixture 回归测试（lint/fixtures/*）
scripts/            # 维护者脚本：a11y-sync、lab、lint/build 层测试
skills/             # 接入说明（skills/meld-ts-core/SKILL.md）
docs/
  requirements/     # 设计稿与路线图（a11y-design.md / a11y-roadmap.md）
  superpowers/      # spec 与 plan（specs/、plans/）
  reviews/          # 代码审查记录，命名格式：YYYYMMDD-描述.md
```

## 常用命令

```bash
bun run fmt            # Biome 格式化 + import 排序（src + test + scripts + tsdown.*.ts；不跑 lint 自动修复）
bun run lint           # Biome lint，warning 视为错误（src + test + scripts + tsdown.*.ts）
bun run ts-check       # tsc --noEmit，TypeScript 5.9.3（锁定版本）类型检查
bun run test           # 运行所有测试 + 覆盖率
bun run a11y:sync      # 维护者：重建 lab，从最新 lint 探测重新生成 a11y 内置表（慢，约 2–4 分钟）
bun run test:a11y-lint # a11y 第 2/3 层：一致性 + 反向测试（lab，慢，不进 CI）
bun run test:a11y-build # a11y 第 4 层：构建产物重载测试（version-bump.yml 发版必跑）
bun run build:browser  # tsdown，产物到 browser/（esm + iife）
bun run build:dist     # tsdown，产物到 dist/（node esm + cjs + dts），并生成 package.json 的 exports
bun run build:bin      # tsdown，meld-ts CLI 到 dist/bin/meld-ts.js（带 bun shebang）
bun run clean          # 删除 dist/ 与 browser/（build 会先跑一遍）
bun run build          # clean && build:browser && build:dist && build:bin
bun run doc            # 生成 TypeDoc API 文档
bun run doc:watch      # TypeDoc 文档监听模式
```

a11y 发版前检查：`test:a11y-build` 由 `version-bump.yml` 发版必跑；`test:a11y-lint` 与 `a11y:sync` 漂移检查要装 lab，发版前手工跑（见 docs/requirements/a11y-roadmap.md）。

## 代码规范

- **格式**：Biome 2.x，2 空格缩进，单引号，行宽 80，LF 换行
- **import 排序**：手动维护时在文件头加 `/** biome-ignore-all assist/source/organizeImports: 手动维护导出排序 */`
- **显式 any**：使用 `// biome-ignore lint/suspicious/noExplicitAny: <reason>` 注释说明原因
- **注释**：只写 WHY，不写 WHAT；JSDoc 格式，包含 @example
- **类型**：strict 模式，verbatimModuleSyntax，不允许隐式 any

### 模块入口与导出

**先分清两种 `export`。** 一个符号要给同目录别的文件用，也得写 `export`。所以「写了 export」不等于「对使用方公开」。本仓库用文件名区分：

- `_` 开头的文件（`_internal.ts`、`_parse.ts`）和目录（`src/_internal/`）：内部符号，只给本包自己用。
- 其他文件：里面每个 `export` 都是公开面，入口会原样转发。

**写或改一个模块，按这个顺序：**

1. **先定公开面。** 列出使用方要直接写出名字的符号。默认不公开，说得出使用方为什么要用它，才公开。只在别的公开类型里出现、能用索引类型取到的（比如 `A11yBuiltinLints['biome']`），不公开。
2. **再按公开面放文件。**
   - 公开符号放普通文件。
   - 只给本模块其他文件用的 helper、常量、中间类型，放同目录的 `_` 文件。
   - 几个模块都要用的内部工具，放 `src/_internal/`。
   - 普通文件里混进了内部符号，就把内部的挪进 `_` 文件。不要在入口里挑着转发。
3. **最后写 `index.ts`：只转发，每个普通文件一行。**

```ts
// src/async/index.ts
export * from './errors';
export * from './retry';
// 有纯类型文件时再加一行：export type * from './types';
// _ 文件不转发
```

- 不写 `export { a, b } from './x'`。想挑着转发，说明 `x` 里混了内部符号，回到第 2 步拆文件。
- 两个文件导出了同名符号，`export *` 会报 TS2308。这时改名，不要改成逐个列举。
- index.ts 里不写实现，也不声明类型。组合出来的公开类型也放进普通文件，它用到的分部文件以 `_` 开头：

```ts
// src/a11y/lints/builtin.ts：普通文件，整份公开
import type { BiomeA11yProfile } from './_biome';

export interface A11yBuiltinLints {
  biome: BiomeA11yProfile;
}

// src/a11y/lints/index.ts：只转发，_ 文件不转发
export * from './builtin';
```

- 单文件模块（`src/timer.ts` 这类）本身就是入口，整份都是公开面。有内部符号，就挪到 `src/_internal/`。

#### 只有 index.ts 能转发

除了 index.ts，任何文件都不能导出别的文件里定义的符号，类型和值都一样。一个符号只从定义它的文件导出，再加上 index.ts 的转发，没有第三条路。

下面这些写法，出现在 index.ts 以外的文件里，一律禁止：

```ts
import { RpcAbortError } from './errors';
export { RpcAbortError };                     // import 进来再导出
export { TimeoutError } from './errors';      // 直接转发
export type { RetryOptions } from './retry';  // 类型也一样
export { retry as retryFn } from './retry';   // 改个名转发
export * from './pending';                    // 星号转发
export * as errors from './errors';           // 命名空间转发
export const TE = TimeoutError;               // 换个名字再导出一遍
export type RO = RetryOptions;
```

- 用到别的文件的符号，import 进来自己用。调用方也要用它，就让调用方自己去 import：同模块从源文件 import，跨模块从对方入口 import。
- 在别的类型基础上定义新类型，是允许的，比如 `export type UseAgentChatOptions = Omit<SessionOptions, 'runtime'> & { blankEpoch?: number }`。判断方法：等号右边只是别处的一个名字、什么都没改，就算转发，禁止。

**搬文件、改名：改所有引用，不留旧路径。**

- 文件换了路径，就把所有 import 改到新路径，删掉旧文件。不要在旧位置留一个转发新文件的空壳。
- 符号改名同理：改掉所有用到它的地方，不留 `export const oldName = newName`。
- 改完用 `rg` 搜旧路径和旧名字，测试、README、`skills/` 下的 SKILL.md 里的路径都要改。再跑 `bun run ts-check` 和 `bun run lint`。
- 唯一要停下来问的情况：搬的是公开入口（package.json `exports` 里的子路径），或者改的是公开符号的名字。这是破坏性改动，先问，不要自己留兼容转发。

**import 规则（防环形引用）：**

- 同一模块内：import 具体文件（`./retry`、`./_internal`），不 import `./index` 或 `.`。
- 跨模块：只 import 对方的入口（`../guards`）或 `src/_internal/`，不 import 对方的具体文件和 `_` 文件。
- `_` 文件在模块里的最底层：普通文件可以 import 它，它不 import 本模块的普通文件。只要类型时可以，写 `import type`。
- 模块之间单向依赖，只能 import 更低层的模块：
  - 最底层：`types`、`_internal`
  - 第二层：`guards`、`base`
  - 第三层：`events`、`timer`、`path`、`singleton`、`traits`、`a11y`（自岛——不 import 任何其他模块）
  - 最上层：`async`、`browser`（聚合全量公开面）
  - `bin` 不参与分层：维护者 CLI 入口，不进 `exports`，深导入 probe 内部文件（见「已知例外」）
- 快要成环时，把两边都要的部分挪到更低一层，通常是 `types` 或 `src/_internal/`。不要用动态 import 或调换 import 顺序来绕。
- `bun run lint` 里的 `suspicious/noImportCycles` 会报环。报了就按上一条改。

**类型 import 与编译产物（实测）：**

「只为类型的 import 必须写 `import type`」不作为本仓库规则。依据是 2026-11-25 的实测（tsc 5.9.3 + bun 1.4.x）：

- `import { type X } from './m'`（整条 import 只有类型）：tsc 开 `verbatimModuleSyntax` 时产物保留 `import {} from './m';`，不开该选项时完全擦除。
- 本仓库的 dist 由 tsdown/rolldown 打包，空 import 完全消失（2026-11 迁移 tsdown 后复测）；混合写法 `import { type X, value }` 的产物与拆成两行的写法逐字节相同。
- 本仓库 tsc 只跑 `--noEmit`，从不产出 JS——这个形态在本仓库任何产物里都不存在。
- 空 import 即使成环也无运行时危害：环上没有代码执行，不碰任何绑定。注意 `noImportCycles` 在源码层仍会把 `import { type X }` 这类整条类型 import 算进环并报错；`useImportType` 会先要求把它改成 `import type`，改完环即消失。别为此拆依赖层。
- 结论：不为此设规则。纯类型 import 的统一写法由 biome `useImportType`（recommended，已启用）处理；混合 import 不设拆行要求。

**已知例外（不要在无关改动里顺手改，调整单独提案）：**

- `src/events/index.ts` 里直接写了实现。新模块不要照着学。
- `src/types/index.ts`：types/ 目录只有这一个文件，实质是单文件模块；改成 `src/types.ts` 会动 dist 布局与 `package.json` 的 types 路径，不值得。
- `src/a11y/probe/`：维护者工具，不进 `exports` 与 browser 产物；内部文件（detect、serialize…）不加 `_` 前缀，`scripts/` 与 `src/bin/` 深导入它们。
- `src/browser/iife.ts`：打包入口，`import * from './index'` 是它的职责；自列模块清单会和 index.ts 重复一份易漏的列表。
- `*.test.ts` import `./index`：测试测的就是公开面，且测试不进 import 图、不会成环。

## TypeScript 版本策略

本仓库涉及三个不同的「TypeScript 版本」，改动时必须一起更新，否则会重演 2026-07 的漂移（peer 写成 `^7`、实际跑 5.9.3、工具链又升不上去）。

| 角色 | 位置 | 当前取值 | 约束 |
|------|------|----------|------|
| 类型支持范围 | `README.md`、`CONTRIBUTING.md`、本文件（不写进 `package.json`） | `>=5.9 <8` | 只写实测过的版本 |
| 仓库工具链 | `devDependencies.typescript` | `5.9.3` | 受 typedoc 限制，不能升到没有编译器 API 的版本 |
| CI 验证矩阵 | `.github/workflows/pr-check.yml` 的 `ts-matrix` | `5.9.3` / `6.0.3` / `7.0.2` | 范围一变就跟着改 |

规则：

1. **不声明 `peerDependencies.typescript`**。本包发布 ESM + CJS，运行时不依赖 TypeScript。一旦声明，npm / bun / pnpm 会自动安装一个 TypeScript（2026-11 实测会装入 `7.0.2` 这个 Go 原生包），纯 JS 消费者被迫承担；pnpm 严格模式下还会因缺 peer 安装失败。
2. **支持范围只作类型承诺**，写在 `README.md`、`CONTRIBUTING.md` 与本文件。消费者版本越界不会在安装阶段被拦，而是在编译 `.d.ts` 时暴露；这是有意为之。
3. **只声明实测过的范围**。`>=5.9` 是实测下界，不是语言特性下界；`<8` 排除未验证的大版本。
4. **工具链与承诺分离**。TS 7 只导出 `./lib/version.cjs` + `./unstable/*`，没有编译器 API，typedoc、api-extractor 这类工具跑不了 7。`devDependencies` 必须留在工具链支持的版本（当前 5.9.x / 6.0.x）。
5. **升级 TypeScript 的清单**，六处缺一处就会再次漂移：
   1. `devDependencies.typescript`
   2. CI 的 `ts-matrix` 矩阵
   3. `README.md` 的「TypeScript 版本」一节
   4. `CONTRIBUTING.md` 的前置要求行（也写着消费者的支持范围）
   5. 本文件的「TypeScript 版本策略」表
   6. 在每一档上跑 `bunx -p typescript@<v> tsc -p tsconfig.json --noEmit`，再跑 `bun run doc` 确认工具链没崩
6. **矩阵必须能挡合并**：main 的 required checks 里要有 `ts-matrix-ok`（三档的聚合 job）。矩阵实例名（`ts-matrix (7.0.2)`）不能作为 required check——版本表一变名字就变。

## a11y 属性规则

JSX 里的 a11y 属性（`role`、`aria-*`、`tabIndex`）不允许手写，只能通过 `@meld-ts/core/a11y` 的 `a11y()` / `a11y.aria()` 写出。下面 5 条是规则原文，用 a11y 的项目把它抄进自己的 `AGENTS.md`（简版在 `skills/meld-ts-core/SKILL.md`）。

1. 能用原生元素就用原生元素（button、a、input、select、dialog…）。
2. 原生元素补状态用 `a11y.aria({...})`，不手写 `aria-*`，也不要对原生元素用 `a11y(role, ...)`。
3. 自定义 role 一律用 `a11y(role, {...})`，不手写 `role=` 和 `aria-*`。
4. 需要可聚焦就传 `focusable: true`，不另外手写 `tabIndex`。唯一例外：只能用脚本聚焦的元素手写 `tabIndex={-1}`。
5. 项目统一从 `src/a11y.ts` 导入 `a11y`，`createA11y` 只在这个文件里调，绑定本项目的 lint 和 output。项目若同时跑多种 lint，`createA11y({ lint: [...] })` 要把它们**全部列出**，只绑一种会漏掉另一种的必填约束。

两个入口各管一半：

| 入口 | 用途 | 输出 |
|------|------|------|
| `a11y(role, {...})` | 自定义 role（switch、img…） | `{ role, ...aria-* }`，带 `focusable` 时加 `tabIndex` |
| `a11y.aria({...})` | 原生元素补 aria 状态 | `{ ...aria-* }`，不带 `role` 键 |

## 已知上游缺口

`aria-colindextext` / `aria-rowindextext` 在 React 19 的 `AriaAttributes` 里有，但 aria-query@5.3.2 没收录，jsx-a11y 6.10.2 的 `aria-props` 把它们当无效属性。所以 `AriaKey` 有意只有 51 个键、不含这两个——等 aria-query 补上，`a11y:sync` 会自动带进来，任何地方都不要手工加键。

确实需要这两个属性时，spread 一个普通对象字面量（CI 的 grep 只匹配 JSX 里字面的 `aria-*=` / `role=`，匹配不到对象键）；role 仍走 `a11y()`，不要写成字面：

```tsx
const extra = { 'aria-colindextext': 'Total', 'aria-rowindextext': 'Q3' };

<div {...a11y('gridcell', { colindex: 3 })} {...extra} />;
```

`a11y:sync` 开始产出这两个键后，删掉这个 workaround，换成 `colindextext` / `rowindextext` 输入键。

## 为什么

`a11y()` 的输出是 spread 进 JSX 的，而 jsx-a11y 这类 lint 规则只读 JSX 里字面写出来的 `role=` / `aria-*`，看不到 spread。改用 `a11y()` 之后，lint 对这些属性不再检查——原来 lint 做的检查由类型接过来：`a11y(role, props)` 按 role 的 lint 规则表约束「必须有什么、允许有什么」，写错在编译时报错。这 5 条规则就是 spread 之外的主要防线。

## CI 检查

PR 检查在 Test 前跑一次 grep（`.github/workflows/pr-check.yml`），排除接入文件 `src/a11y.ts` 和库自身的 `src/a11y/`：

```
rg --pcre2 '\b(role|aria-[a-z]+)\s*=(?!=)|\btabIndex\s*=\s*\{(?!\s*-1\s*\})|\btabIndex\s*=\s*["'\'']|\btabindex\s*=\s*["'\'']' \
  --glob '*.{tsx,jsx}' \
  --glob '!src/a11y/**' \
  --glob '!src/a11y.ts'
```

rg 自身出错（正则坏、缺 PCRE2、命令不在）不放行——exit 2 时用 `git ls-files` 清点仓库的 tsx/jsx，滤掉排除路径（`src/a11y/`、`src/a11y.ts`）后还有文件就失败（`rg failed with exit 2`）；全部在排除路径里、或根本没有 tsx/jsx 才放行（`only excluded tsx/jsx files`）。

它能抓到 `role="x"`、`role = "x"`、`role={var}`、模板串等写法；`tabIndex` 一并抓（`tabIndex={0}`、`tabIndex={var}`，以及字符串形式 `tabIndex="0"` / `tabindex="0"`），唯一例外是手写的字面 `tabIndex={-1}`（§8 规则 4 的脚本聚焦例外）。也会误报普通代码里的 `role = ...` 赋值，以及 `data-role` / `data-aria-label` 这类 data-* 属性（都属 fail-closed：宁可拦下人工排查，不放过真违规），按需加排除。抓不全的变形（比如先拼对象再 spread）靠上面的规则兜。

例外：`.cache/a11y-lab` 的一致性测试 fixture 故意写字面属性——fixture 要喂给 lint，而 lint 看不到 spread（设计见 `docs/requirements/a11y-design.md` §7）。fixture 在 `.cache`（gitignore）里，不进这个检查。

## CLI 扩展约定

目前唯一的 bin 是 `meld-ts`（`package.json` 的 `"bin"` 只登记这一个）。以后新增任何命令行能力，都作为子命令挂进这个入口，**不新增 bin**：

```
meld-ts <group> <command> [options]
```

- 新 group 的路由加在 `src/bin/meld-ts.ts`；实现放在可单测的模块里。
- 每个命令必须支持 `--help`（stdout + 退出 0），错误走 stderr + 非零退出。
- 打包只走 `tsdown.bin.ts` 单一入口，产物在 `dist/bin/`；不把 bin 加进 `exports`。
- 用户侧调用：项目脚本里直接写 `meld-ts ...`，或 `bunx --package @meld-ts/core meld-ts ...`。

## 架构约定

### _internal 层
`_internal/` 中的常量（`_typeStr`、`_typeNum` 等）只在库内部使用，目的是减少字符串字面量重复和保证运行时一致性。新增内部常量放在 `_internal/consts.ts`，内部辅助函数放在 `_internal/utils.ts`。

### guards 模块
- 每种类型一个文件，对应一个测试文件
- 守卫函数命名：`isXxx`（类型守卫）、`notEmptyXxx`（非空守卫）、`toXxx`（转换）
- `logicality.ts` 提供 `and / or / not` 组合器，其中 `not` **不做类型收窄**（TypeScript 不支持否定类型）
- `arrayGuard(guard)` 对空数组返回 `true`（全称量词对空集成立），需要非空时配合 `and`

### traits 模块
使用模式：
```ts
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
class MyClass { ... }

implTraits(MyClass, myTrait)

// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface MyClass extends MyTrait {}
```
`implTraits` 复制属性描述符（含 Symbol 键），跳过 `constructor`，支持 getter/setter。

`configurable` 的 `getAll()` 返回深拷贝（`cloneObject`），修改返回值不会污染内部 presets。
`get(key)` 返回的是内部引用（未拷贝），嵌套对象仍与内部共享——若需隔离请使用 `getAll()`。

### events 模块
- 监听器并发执行（`Promise.all`），**emit 不会因监听器异常而 reject**——异常被静默 catch，通过 `options.onError` 回调通知
- `once` 回调在触发前就摘除，成功失败都只触发一次（不重试失败的 once）
- `off()` 三档重载：`off()` 清除所有事件全部监听器、`off(name)` 清除指定事件全部监听器、`off(name, callback)` 清除特定回调
- `linkEvents` 的 `mode='once'` 对 `EventsDelegator` 同样生效——`inject(emitter, forceOnce)` 会强制所有回调只触发一次
- `createDelegator` 返回的 `inject` 接受可选第二参数 `forceOnce`，为 `true` 时覆盖回调自身的 `once` 标记

### async 模块
- `pending` / `pendingFn` 使用全局 `scopeRegistry` 检测静态 scope 重复注册，测试中务必在 `afterEach` 调用 `clearPendingRegistry()`；HMR 场景改用 `createPending()` 创建模块级独立实例
- `retry` 和 `retryFn` 都在内部冻结 options 副本（`Object.freeze`），`RetryExhaustedError.options` 存储的是冻结副本，调用方后续修改原始 options 不影响已创建的 wrapper 行为
- `timeout` 内部对 fnPromise 添加 `.catch(() => {})`，防止 timeout 赢之后 fn 延迟 reject 产生 unhandled rejection
- `StatefulRpc.settle()` 中事件发射是 fire-and-forget，**不等待事件处理完成**再 resolve/reject Promise——先 settle Promise 再 emit 事件，事件处理器不应依赖"此时 Promise 未 settle"的假设。emit 的异常由 emitter 的 `onError` 接管（StatefulRpc 默认 `console.warn`）
- `path.ts` 的 `dangerReplace` 对每个顶层 `join(...paths)` 参数恰好执行一次——`handlePart` 内部 split 出的子段跳过 `purge`，不会重复触发 `dangerReplace`

## 构建产物说明

| 命令 | 产物目录 | 格式 | target |
|------|----------|------|--------|
| `build:dist` | `dist/` | esm + cjs | node |
| `build:browser` | `browser/` | esm + iife | browser |
| `build:bin` | `dist/bin/` | esm | node |
| `build` | `dist/` + `browser/` + `dist/bin/` | 同上 | 同上 |

`build:dist` 会清空 `dist/`（连带 `dist/bin`）；`build` 链把 `build:bin` 放在最后，完整构建后 bin 一定在。

`exports` 字段由 `build:dist`（tsdown `exports: true`）在构建末尾生成：`import`/`require` 双条件指向各入口产物，`types` 靠同名 `.d.ts`/`.d.cts` 邻近声明解析，不写显式 types 条件（publint + attw 全策略实测通过）。改入口集合后跑 `bun run build:dist` 即可刷新。

`package.json` 的 `exports` 字段声明了以下子路径：
- `.` — 主入口（types + guards + base）
- `./timer` `./singleton` `./path`
- `./traits` `./events` `./async`
- `./a11y`
- `./package.json`

`browser/` 目录不在 `exports` 中——它只应被网页 `<script>` 直接引用，不应被打包工具作为模块导入。

### browser 用法的实证契约（不许推翻）

browser 的用法是实测钉死的对外契约，review 或迁移不得以「现代解析模式不兼容」为由改它（2026-11 实测：npm 安装 1.0.2 + TS 5.9.3 三档 resolution）：

- 主用法是 CDN URL 直接引用（README「浏览器使用」）：`<script src>`（iife，全局 `MeldTS`）与 `<script type="module">`（ESM），不经过 node_modules 与打包工具，不受 `exports` 影响。
- iife 全局类型注入写法（项目 d.ts 里 `var MeldTS: typeof import('@meld-ts/core/browser')`）在 `moduleResolution: node`（legacy）下实测可用；`bundler` / `nodenext` 下 TS2307 是用户 resolution 配置差异的已知局限，不是文档错误。
- 因此：不改 README 写法、不改 browser 产物结构（`iife.global.js` / `index.d.ts` / `index.js` 三个必须文件）、不往 `exports` 加 `./browser`（含仅类型子路径）。

`bin`（`dist/bin/meld-ts.js`，独立 `tsdown.bin.ts` 打包）同样不在 `exports` 中——它只应作为命令行工具运行（`meld-ts a11y probe`）。

## 审查记录

审查文档存放在 `docs/reviews/`，命名格式：`YYYYMMDD-描述.md`，例如 `20260613-思源审查.md`。
问题追踪和修复均通过审查文档管理。
