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
scripts/            # 维护者脚本：a11y-sync、lab、lint/build 层测试
skills/             # 接入说明（skills/meld-ts-core/SKILL.md）
docs/
  requirements/     # 设计稿与路线图（a11y-design.md / a11y-roadmap.md）
  superpowers/      # spec 与 plan（specs/、plans/）
  reviews/          # 代码审查记录，命名格式：YYYYMMDD-描述.md
```

## 常用命令

```bash
bun run fmt            # Biome 格式化（src + test + scripts + bunup.*.ts）
bun run lint           # Biome lint，warning 视为错误（src + test + scripts + bunup.*.ts）
bun run ts-check       # tsc --noEmit，TypeScript 5.9.3（锁定版本）类型检查
bun run test           # 运行所有测试 + 覆盖率
bun run a11y:sync      # 维护者：重建 lab，从最新 lint 探测重新生成 a11y 内置表（慢，约 2–4 分钟）
bun run test:a11y-lint # a11y 第 2/3 层：一致性 + 反向测试（lab，慢，不进 CI）
bun run test:a11y-build # a11y 第 4 层：构建产物重载测试（version-bump.yml 发版必跑）
bun run build:exports  # 基于 bunup.config 生成 package.json 的 exports 部分
bun run build:browser  # bunup，产物到 browser/（esm + iife）
bun run build:dist     # bunup，产物到 dist/（node esm + cjs）
bun run build:bin      # bunup，meld-ts CLI 到 dist/bin/meld-ts.js（带 bun shebang）
bun run build          # build:browser && build:dist && build:bin
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

每个模块的 `index.ts` 只做星号汇总，**禁止逐个列举**导出：

```ts
// 对
export * from './types';
export * from './createA11y';

// 错
export type { A11yOptions, A11yProfile } from './types';
export { createA11y } from './createA11y';
```

不想对外暴露的符号，放进同目录 `_` 开头的文件（如 `_internal.ts`、`_checks.ts`），它们不会被入口的星号带上。不要靠入口文件的逐个列举来筛公开面：每加一个符号就要改两处，浪费 token 又容易漏。

纯类型模块也可以写 `export type * from './xxx'`，仍然是星号。

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
- 打包只走 `bunup.bin.ts` 单一入口，产物在 `dist/bin/`；不把 bin 加进 `exports`。
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

`build:dist` / `build:exports` 会清空 `dist/`（连带 `dist/bin`）；`build` 链把 `build:bin` 放在最后，完整构建后 bin 一定在。

`package.json` 的 `exports` 字段声明了以下子路径：
- `.` — 主入口（types + guards + base）
- `./timer` `./singleton` `./path`
- `./traits` `./events` `./async`
- `./a11y`
- `./package.json`

`browser/` 目录不在 `exports` 中——它只应被网页 `<script>` 直接引用，不应被打包工具作为模块导入。

`bin`（`dist/bin/meld-ts.js`，独立 `bunup.bin.ts` 打包）同样不在 `exports` 中——它只应作为命令行工具运行（`meld-ts a11y probe`）。

## 审查记录

审查文档存放在 `docs/reviews/`，命名格式：`YYYYMMDD-描述.md`，例如 `20260613-思源审查.md`。
问题追踪和修复均通过审查文档管理。
