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
  browser.ts        # Browser 全量入口（iife 全局变量 MeldTS）
docs/
  reviews/          # 代码审查记录，命名格式：YYYYMMDD-描述.md
```

## 常用命令

```bash
bun run fmt          # Biome 格式化（src/）
bun run lint         # Biome lint，warning 视为错误
bun run ts-check     # tsgo --noEmit，TS 6.x 原生检查
bun run test         # 运行所有测试 + 覆盖率
bun run build        # bunup，产物到 dist/（node esm + cjs）
bun run build:browser # bunup，产物到 browser/（iife + esm）
```

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

### events 模块
- 监听器并发执行（`Promise.all`），任意一个抛出时以 `AggregateError` 拒绝
- `once` 回调无论成功失败都在触发后清理（不重试失败的 once）
- 目前无 `removeAllListeners`，长期存活的 emitter 需要用户手动管理订阅生命周期

### async 模块
- `pending` / `pendingFn` 使用全局 `scopeRegistry` 检测静态 scope 重复注册，测试中务必在 `afterEach` 调用 `clearPendingRegistry()`
- `StatefulRpc.settle()` 中事件发射是 fire-and-forget（`.catch(console.error)`），**不等待事件处理完成**再 resolve/reject Promise，事件处理器不应依赖"此时 Promise 未 settle"的假设
- `path.ts` 的 `dangerReplace` 在处理含分隔符的路径段时会被多次调用，有状态实现需注意

## 构建产物说明

| 命令 | 产物目录 | 格式 | target |
|------|----------|------|--------|
| `build` | `dist/` | esm + cjs | node |
| `build:browser` | `browser/` | esm + iife | browser |

`package.json` 的 `exports` 字段声明了以下子路径：
- `.` — 主入口（types + guards + base）
- `./timer` `./singleton` `./path`
- `./traits` `./events` `./async`
- `./package.json`
