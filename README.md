# @meld-ts/core

<img src="assets/meld-ts.png" width="320" />

[![version](https://img.shields.io/npm/v/@meld-ts/core?style=for-the-badge)](https://www.npmjs.com/package/@meld-ts/core)
[![bundlephobia](https://img.shields.io/bundlephobia/min/@meld-ts/core?style=for-the-badge)](https://www.npmjs.com/package/@meld-ts/core)
[![coverage](https://img.shields.io/badge/coverage-100%25-orange?style=for-the-badge)](https://www.npmjs.com/package/@meld-ts/core)
[![GitHub](https://img.shields.io/badge/GitHub-meld--ts%2Fcore-181717?style=for-the-badge&logo=github)](https://github.com/meld-ts/core)
[![Docs](https://img.shields.io/badge/Docs-meld--ts.github.io%2Fcore-1C2D24?style=for-the-badge)](https://meld-ts.github.io/core/)

从 [@zenstone/ts-utils](https://www.npmjs.com/package/@zenstone/ts-utils) 拆分的 TypeScript 核心工具库。
零运行时依赖，面向 Node.js / Bun 和浏览器双平台。

核心设计原则：

- **类型推断优先** — 泛型从原函数推断，无需手动标注。`retry(fn)` 返回的函数自动保持 `fn` 的参数与返回值类型。
- **`unknown` 守住边界** — 对外暴露的类型一律 `unknown`，迫使使用者显式收窄；`any` 只出现在泛型约束的基底声明中。
- **高阶函数模式** — `retry`、`timeout` 等是 `fn => fn` 的包装器，返回增强后的函数而非立即执行。
- **不过度抽象** — 没有 DI、没有装饰器、没有配置体系。三行能解决的事不封装成类。

API 文档由 TypeDoc 生成，在线浏览：[meld-ts.github.io/core](https://meld-ts.github.io/core/)

## 安装

```bash
npm install @meld-ts/core
# pnpm
pnpm add @meld-ts/core
# bun
bun add @meld-ts/core
```

## 使用

### 子路径导入（推荐）

各模块独立打包，按需引入，避免无谓的依赖捆绑：

```ts
import { isString, notEmptyString, and } from '@meld-ts/core';
import { createEmitter, initEventsEmitter, once } from '@meld-ts/core/events';
import { StatefulRpc, pending, retry, sleep } from '@meld-ts/core/async';
import { createPathUtils } from '@meld-ts/core/path';
import { implTraits, configurable } from '@meld-ts/core/traits';
import { createTimer } from '@meld-ts/core/timer';
import { singleton } from '@meld-ts/core/singleton';
import { createA11y } from '@meld-ts/core/a11y';
```

### 主入口

```ts
import { isString, isNumber, cloneObjectByJson } from '@meld-ts/core';
```

主入口包含 types、guards、base 三个模块，是最常用的基础工具集合。

## 模块

| 子路径 | 内容简介 |
|--------|---------|
| `@meld-ts/core` | 核心类型定义、类型守卫（guards）、基础对象操作（base） |
| `@meld-ts/core/timer` | 前缀隔离的定时器管理（setTimeout / setInterval） |
| `@meld-ts/core/singleton` | 同步与异步并发安全的单例工厂 |
| `@meld-ts/core/path` | 可插拔安全策略的路径拼接工具 |
| `@meld-ts/core/traits` | Mixin 系统（implTraits / configurable / debuggable） |
| `@meld-ts/core/events` | 事件发射器（Promise.all 并发 / 委托者 / 链式注册） |
| `@meld-ts/core/async` | 异步工具（StatefulRpc / pending / retry / timeout / sleep） |
| `@meld-ts/core/a11y` | 按 lint 规则表约束 aria 属性的构造器（createA11y，含类型与运行时）。内置 eslint / bun / oxlint / biome 四张表，数据由 `bun run a11y:sync` 从真实 lint 探测生成；用户项目可用随包发布的 `meld-ts a11y probe` 按自己装的 lint 版本生成重载表 |

`createA11y` 的 `output`：默认 `react` 给 React JSX 用；`html` 把值字符串化（`50` → `"50"`），给 DOM API 和字符串模板用。不要把 `html` 输出 spread 进有类型的 React JSX——React 把 `aria-valuenow` 等类型成 `number`，过不了 `tsc`。

`createA11y` 的 `lint`：项目里跑几家 jsx-a11y 类 lint，`lint` 就传那几家。没有「最严的一张表」可挑——内置表互不为超集：eslint 要求 `combobox` 带 `controls`，biome 不要求；biome 要求可聚焦 `separator` 带 `valuenow`，eslint 不要求。只绑一家，另一家的必填约束就漏了。跑多家就传数组，`required` 取并集、`supported` 取交集——数组里每家都过：

```ts
const a11y = createA11y({ lint: ['eslint', 'biome'] });
```

探针（`meld-ts a11y probe`）只把探测到的 lint 写进 `A11yLintOverrides`，不会替你合并——跑几家就列几家。

## CLI

包内提供 `meld-ts` 命令（需要 Bun）：

```bash
# 项目里一次性运行
bunx --package @meld-ts/core meld-ts a11y probe

# 或写进 package.json scripts
"a11y": "meld-ts a11y probe"
```

当前命令：

- `meld-ts a11y probe [--lint=biome,oxlint] [--out=./a11y-lints.generated.d.ts] [--keep]`：按项目安装的 lint 版本生成重载表。
- `meld-ts --version`、`meld-ts --help`。

`meld-ts` 是唯一的 CLI 入口。以后新增功能都会以 `meld-ts <group> <command>` 的形式加入，不会新增 bin。

## 浏览器使用

`browser/` 目录提供针对浏览器环境的构建产物，所有模块合并为单文件：

- **ESM**：`browser/index.js`
- **iife**：`browser/iife.global.js`，全局变量 `MeldTS`

通过 CDN 直接引用：

```html
<!-- iife，适合直接在页面中使用 -->
<script src="https://cdn.jsdelivr.net/npm/@meld-ts/core/browser/iife.global.js"></script>
<script>
  const { isString, createEmitter } = MeldTS;
</script>

<!-- ESM，适合现代构建环境或原生 ES modules -->
<script type="module">
  import { isString } from 'https://cdn.jsdelivr.net/npm/@meld-ts/core/browser/index.js';
</script>
```

**unpkg**

- iife：https://unpkg.com/@meld-ts/core/browser/iife.global.js
- esm bundle: https://unpkg.com/@meld-ts/core/browser/index.js

JSDmirror

- iife: https://cdn.jsdmirror.com/npm/@meld-ts/core/browser/iife.global.js
- esm bundle: https://cdn.jsdmirror.com/npm/@meld-ts/core/browser/index.js

可以在项目中的 d.ts 中添加全局变量声明（针对 iife）

```ts
declare global {
  var MeldTS: typeof import("@meld-ts/core/browser");
}
```


## 开发

```bash
bun run fmt:all       # Biome 格式化全源代码（src + test + scripts + tsdown.*.ts）
bun run fmt ./文件名   # Biome 格式化特定文件
bun run lint          # Biome lint，warning 视为错误（src + test + scripts + tsdown.*.ts）
bun run ts-check      # tsc --noEmit，TypeScript 7（锁定版本）类型检查
bun run test          # 运行所有测试 + 覆盖率
bun run a11y:sync     # 维护者：重建 lab，从最新 lint 重新探测生成 a11y 内置表（慢）
bun run test:a11y-lint  # a11y 一致性 + 反向测试（lab，慢，发版前手工）
bun run test:a11y-build # a11y 构建产物重载测试（version-bump.yml 发版必跑）
bun run build:browser # 构建 browser （ESM + iife）
bun run build:dist    # 构建 node （ESM + cjs），并生成 package.json 的 exports
bun run build:bin    # 构建 meld-ts CLI（dist/bin/meld-ts.js）
bun run build         # dist + browser + bin
bun run doc           # 生成 TypeDoc API 文档
```

## TypeScript 版本

- **不需要 TypeScript 也能用**：发布物是 ESM + CJS，运行时不依赖 TypeScript；本包**不声明** `peerDependencies.typescript`，纯 JS 消费者不会被自动安装任何 TypeScript 版本。
- **类型支持范围**：`>=5.9 <8`。这是实测过的范围（下界 5.9 是验证过的低版本，不是语言特性下限），由 CI 的 `ts-matrix` 对 5.9.3 / 6.0.3 / 7.0.2 三档持续验证。
- **越界不会在安装阶段被拦**：TypeScript 版本超出范围时，安装照常成功，问题会在编译 `.d.ts` 时暴露。这是有意的取舍。
- **仓库工具链版本**：typedoc 用 5.9.3，类型检查和测试用 7.0.2。`bun run doc` 使用的 typedoc 依赖 TypeScript 的编译器 API，而 TS 7 只提供 AST 层 API（`unstable/ast`），因此文档工具链不能升到 7。

类型支持范围与仓库工具链版本是两件事：前者是给使用者的承诺，后者是构建和文档工具需要的版本。升级策略见 `AGENTS.md` 的「TypeScript 版本」。

## 构建说明

目前项目构建，使用 [tsdown](https://tsdown.dev)（底层为 rolldown）。

- `tsdown.config.ts` 是项目的主构建：node 产物到 dist（esm + cjs + dts），跨入口共享代码进 shared chunk（CJS 同样支持 tree shake 与 chunk 共享），并在构建末尾生成 package.json 的 `exports`、`main`、`types` 字段——类型不写显式 types 条件，靠同名 `.d.ts`/`.d.cts` 邻近声明解析。
- `tsdown.bin.ts` 用于构建 meld-ts CLI（`meld-ts a11y probe`），输出 `dist/bin/meld-ts.js`，带 bun shebang；bin 不在 `exports` 里，只应作为命令行工具运行。
- `tsdown.browser.ts` 用于构建 browser 内容，将所有 modules 合并，输出目录在 browser，输出 esm + iife 格式。
  - `browser/index.js` esm 引入文件，注意这个不能放在 exports ，他只应被网页 `<script type="module">` 的方式去引用
  - `browser/index.d.ts` 作为所有源代码统一导出的 d.ts ，只应该被用于注入全局变量类型标注，而不应该直接在源代码中引用。
  - `browser/iife.global.js` 作为 iife 输出，会为注入全局变量 `MeldTS`

> browser 一体化打包，主要提供给开箱即用的场景，毕竟浏览器 JS 自身也在不断发展和完善。
> 
> html script 直接 esm import 或者 iife remote load ，才是 JS 开发本来的样子。
> 
> 我们已经被预编译，转译器绑架得太久了。 

## License

MIT
