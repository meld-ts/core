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
bun run fmt           # Biome 格式化（src/）
bun run lint          # Biome lint，warning 视为错误
bun run ts-check      # tsgo --noEmit，TS 6.x 原生类型检查
bun run test          # 运行所有测试 + 覆盖率
bun run build:exports # 基于预期的构建内容，生成 package.json exports 部分内容
bun run build:browser # 构建 browser （ESM + iife）
bun run build:dist    # 构建 node （ESM + cjs）
bun run build         # dist + browser
bun run doc           # 生成 TypeDoc API 文档
```

## 构建说明

目前项目构建，使用 bunup 。

- `bunup.config.ts` 用于构建 node 的部分，输出目录在 dist，输出 esm + cjs。也是项目的主构建。
- `bunup.exports.ts` 基于主构建 `bunup.config.ts` 的内容，来生成 package.json 的 `exports`, `main`, `module`, `types`, `files` 部分。
- `bunup.browser.ts` 用于构建 browser 内容，将所有 modules 合并，输出目录在 browser，输出 esm + iife 格式。
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
