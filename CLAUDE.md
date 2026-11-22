# @meld-ts/core — CLAUDE.md

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
  bin/              # meld CLI（a11y probe 路由与参数解析，独立打包到 dist/bin）
docs/
  reviews/          # 代码审查记录，命名格式：YYYYMMDD-描述.md
```

## 常用命令

```bash
bun run fmt            # Biome 格式化（src/）
bun run lint           # Biome lint，warning 视为错误（src + test）
bun run ts-check       # tsc --noEmit，TypeScript 5.9.3（锁定版本）类型检查
bun run test           # 运行所有测试 + 覆盖率
bun run a11y:sync      # 维护者：重建 lab，从最新 lint 探测重新生成 a11y 内置表（慢，约 2–4 分钟）
bun run test:a11y-lint # a11y 第 2/3 层：一致性 + 反向测试（lab，慢，不进 CI）
bun run test:a11y-build # a11y 第 4 层：构建产物重载测试（发版前）
bun run build:exports  # 基于 bunup.config 生成 package.json 的 exports 部分
bun run build:browser  # bunup，产物到 browser/（esm + iife）
bun run build:dist     # bunup，产物到 dist/（node esm + cjs）
bun run build:bin      # bunup，meld CLI 到 dist/bin/meld.js（带 bun shebang）
bun run build          # build:browser && build:dist && build:bin
bun run doc            # 生成 TypeDoc API 文档
bun run doc:watch      # TypeDoc 文档监听模式
```

a11y 发版前检查：`test:a11y-lint`、`test:a11y-build`，外加 `a11y:sync` 漂移检查（见 docs/requirements/a11y-roadmap.md）。

## 代码规范

- **格式**：Biome 2.x，2 空格缩进，单引号，行宽 80，LF 换行
- **import 排序**：手动维护时在文件头加 `/** biome-ignore-all assist/source/organizeImports: 手动维护导出排序 */`
- **显式 any**：使用 `// biome-ignore lint/suspicious/noExplicitAny: <reason>` 注释说明原因
- **注释**：只写 WHY，不写 WHAT；JSDoc 格式，包含 @example
- **类型**：strict 模式，verbatimModuleSyntax，不允许隐式 any

## 审查记录

审查文档存放在 `docs/reviews/`，命名格式：`YYYYMMDD-描述.md`，例如 `20260613-思源审查.md`。
问题追踪和修复均通过审查文档管理。

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
- `once` 回调无论成功失败都在触发后清理（不重试失败的 once）
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

`bin`（`dist/bin/meld.js`，独立 `bunup.bin.ts` 打包）同样不在 `exports` 中——它只应作为命令行工具运行（`meld a11y probe`）。
