# src JSDoc 补全实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run doc:check` 达到 0 error 0 warning:补全 30 个 JSDoc 点位、导出 `SetTimer`/`PendingItem`、归置 `UnionToIntersection` 到 `src/_internal/types.ts`、`typedoc.json` 登记 24 个 referenced 豁免。全链(doc:check / lint / ts-check / test / doc)不回归。

**Architecture:** 纯注释 + 两个类型导出 + 一处类型搬移 + 一份配置。不改运行时逻辑,不改类型定义结构(导出修饰与搬移除外)。26 条 referenced 警告的裁决档案见 spec §2,review 时按此核对。

**Tech Stack:** TypeScript 5.9.3(仓库锁定)、Bun、Biome、typedoc 0.28.19(不升级;0.28.20 实测零收益,1.0.0-dev.4 插件全不兼容)

**Spec:** `docs/superpowers/specs/2026-11-28-jsdoc-coverage-design.md`(§2 裁决记录、§3 改动清单、§3.5 写作规范)

**执行方式:** Task 1–4 写码 subagent 用 GLM 5.3 max(`bottlerocket/zai-org/GLM-5.3#max`),串行执行,每 task 完成后 task review(grok 4.6 xhigh);Task 5–6 由 controller 执行;全部完成后 final review(grok 4.6 xhigh)按 spec §2 裁决记录核对;review 修复后交用户上 argus。

## Global Constraints

- AGENTS.md 全部规则;JSDoc 一节 1–6 条逐条适用(第 5、6 条为 2026-11-28 新增)。
- 只动本 plan 列出的文件与点位。禁止顺手重构、禁止改 30 个点位之外的 JSDoc、禁止改运行时代码(Task 4 的类型搬移除外)。
- JSDoc 中文;标识符/API 名/专有术语英文;禁止空洞文档——每句话的事实要能在源码指出处;只写使用方视角需要知道的,实现里已有的 WHY 注释一律不动。
- typedoc 保持 0.28.19,不升级。
- 改完格式化:`bun fmt <文件路径>`;单文件验证 `bun test <路径>`(不带 `--coverage`,单跑文件的覆盖率读数无意义)。
- 每个 task 一个 commit(conventional commits,中文 subject,如 `docs: 补全 timer/singleton 公开符号 JSDoc`)。
- `src/bin/`、`src/a11y/probe/`、`*.test.ts` 不属本 plan(迁出是第二个任务);public-surface 断言更新除外。

---

### Task 1: timer.ts + singleton.ts JSDoc 补全;SetTimer 导出

**Files:**
- Modify: `src/timer.ts`
- Modify: `src/singleton.ts`
- Modify: timer 公开面断言(`rg -l public-surface src/` 找;若断言含 timer)

**要求**(写 JSDoc 前必须读源码;「要点」是内容方向,不是照抄文案):
- [ ] `TimerMode`(TypeAlias 无文档):三种模式语义——`'timeout'`(setTimeout,一次性)、`'interval'`(setInterval,循环)、自定义对象(覆盖平台定时器:requestAnimationFrame、测试 fake timer 等场景)。
- [ ] `TimerCustomMode`(Interface 无文档):自定义模式实现接口;`@typeParam Id`——从 `set` 返回值推断,`clear` 接收同类型。
- [ ] `TimerCustomMode.clear`(Property):按 `set` 返回的 id 清除。
- [ ] `TimerOptions`(Interface 无文档):prefix / mode / onError 三属性语义 + `[key: string]: unknown` 索引签名说明;`@defaultValue`(prefix 无前缀、mode `'timeout'`)。
- [ ] `TimerOptions.onError`(Property):触发时机(回调同步抛错或返回的 Promise reject)、参数 `(error, fullKey)`(fullKey 带前缀);不传则静默。
- [ ] `SetTimer`:`export type SetTimer` + JSDoc(spec §2.1 D-1 裁决:TimerCustomMode.set 的实现者就是使用方)。导出后 notDocumented 生效。
- [ ] `singleton` 的 `@typeParam F`:F 从 factory 推断;返回 `(...args: Parameters<F>) => ReturnType<F>`,同参同返回。JSDoc 归属位置正确,不动 overload 结构。

**验证:**
- `bun test src/timer.test.ts src/singleton.test.ts` 全绿
- `bun fmt src/timer.ts src/singleton.ts`
- timer 公开面断言补 `SetTimer`

### Task 2: path.ts + events JSDoc 补全;@param 修正

**Files:**
- Modify: `src/path.ts`
- Modify: `src/events/index.ts`

**要求:**
- [ ] `DirectorySeparator`:支持的分隔符字面量。
- [ ] `PathInput`:允许 null/undefined/空串,按空处理。
- [ ] `UnixDS` / `WinDS`:常量用途——separator 缺省取 UnixDS;WinDS 供 Windows 风格显式指定。
- [ ] `PathReplacementCallback`:回调契约——参数 `(path, separator)`、返回替换后字符串;执行时机引用 dangerReplace/duplicateReplace 属性文档,不重复内容。
- [ ] `PathUtilsOptions`:顶层说明;`separator` 属性也缺文档,一并补——空串默认 `/`,多字符取首字符(与 createPathUtils 实现一致)。
- [ ] `createPathUtils` 的 `@param` 修正(3 条错位):typedoc 对解构参数不识别 `options.xxx` 点号写法;收敛为 `@param options` 一条,字段细节引用 `PathUtilsOptions` 属性文档。不改函数签名。
- [ ] `MaybePromise`:回调可同步可异步。
- [ ] `EventsEmitter.on`:返回反注册函数;`isOnce` 语义。
- [ ] `EventsEmitter.off` 两个无文档 overload(`off(name)`、`off(name, callback)`):各自补;按引用匹配移除;第一个 overload 现有注释不动。
- [ ] `EventsEmitter.emit`:监听器并发执行(Promise.all);监听器抛错/reject 转 `onError`,emit 自身不 reject;返回 `Promise<void>`。
- [ ] `EventsEmitterOptions`:顶层说明。
- [ ] `EventsEmitterOptions.onError`:`(err, name)` 触发时机;不传静默。
- [ ] `LinkEventMode`:`'on'`/`'once'`/`'off'` 三种模式语义(linkEvents 第三参)。

**验证:**
- `bun test src/path.test.ts src/events/index.test.ts src/events/linkEvents-once.test.ts` 全绿
- `bun fmt src/path.ts src/events/index.ts`

### Task 3: traits + async JSDoc 补全;PendingItem 导出;sleep @param 修正

**Files:**
- Modify: `src/traits/configurable.ts`
- Modify: `src/traits/debuggable.ts`
- Modify: `src/async/retry.ts`
- Modify: `src/async/StatefulRpc.ts`
- Modify: async 公开面断言(补 `PendingItem`)

**要求:**
- [ ] `Configurable`(configurable.ts):接口顶层说明——两层数据(presets/users)、get 优先级;六个方法已有文档不重复。
- [ ] `DebugConfiguration.format`(debuggable.ts):`(vars, styles) => string[]`;返回传给 `console.log` 的参数数组;与 `method` 的关系。
- [ ] `sleep` 的 `@param fn` 修正(retry.ts):JSDoc 挂在实现签名上被 typedoc 绑定到无 fn 的第一个 overload——JSDoc 拆到两个 overload 声明前各写各的 `@param`(ms / ms+fn),`@example` 放第一个 overload,实现上方不留 JSDoc。不改函数结构。
- [ ] `PendingItem`(StatefulRpc.ts):`export type PendingItem` + JSDoc(spec §2.1 D-1 裁决:protected 扩展点 newPendingItem/addPendingItem 的参数类型,子类实现时要构造此结构)。resolve/reject 为 Promise settle 函数、timeout 为该 task 的超时毫秒。

**验证:**
- `bun test src/traits/configurable.test.ts src/traits/configurable-getAll.test.ts src/traits/debuggable.test.ts src/async/retry.test.ts src/async/StatefulRpc.test.ts` 全绿
- `bun fmt` 四个文件
- async 公开面断言补 `PendingItem`

### Task 4: UnionToIntersection 归置 + a11y JSDoc

**Files:**
- Create: `src/_internal/types.ts`
- Modify: `src/_internal/index.ts`
- Modify: `src/traits/implTraits.ts`
- Modify: `src/a11y/types.ts`

**前置:** 读 `docs/a11y.md` 与 `docs/requirements/a11y-design.md`,JSDoc 术语与两文档对齐。

**要求:**

归置(先做,再补 JSDoc):
- [ ] 新建 `src/_internal/types.ts`:`UnionToIntersection` 定义(从 `src/traits/implTraits.ts` 搬,含其现有简短注释)+ 简短 JSDoc。
- [ ] `src/_internal/index.ts` 加 `export * from './types'`(内部转发;包入口不导出 `_` 目录,合规)。
- [ ] `src/traits/implTraits.ts`:删本地定义,`import type { UnionToIntersection } from '../_internal'`。
- [ ] `src/a11y/types.ts`:删本地定义(L73–79),同上 import。
- [ ] `rg UnionToIntersection src/` 只剩 `src/_internal/types.ts` 定义与两处 import(AGENTS.md「搬文件、改名」)。

a11y JSDoc(4 个点位):
- [ ] `ResolveProfile`:lint 选择 → 生效表:单名 → 内置表;多名/数组 → MergeProfiles 合并(supported 取交集)。
- [ ] `A11yInput`:输入形状——必填键必选、支持键可选(可 undefined)、focusable、名字规则随 role。
- [ ] `A11yAttrs`:输出形状——role + `aria-*` 键 + tabindex 规则 + 空值键消失(label/idlist 空值按没传处理)。
- [ ] `A11y.aria`(CallSignature):原生元素补状态,不带 role;拦 union props(现有代码注释已述,提炼为使用方视角)。

**注意:** `AriaAttrs`、`FocusAttr` 及 14 个内部类型机器**不动**(不导出、不改名、注释不动),它们走 typedoc.json 豁免(Task 5)。

**验证:**
- `bun test src/traits/implTraits.test.ts src/a11y/types.test.ts src/a11y/createA11y.test.ts src/a11y/override.test.ts src/a11y/public-surface.test.ts` 全绿
- `bun fmt` 四个文件
- `rg UnionToIntersection src/` 输出符合归置要求

### Task 5: typedoc.json 豁免名单(controller 执行,不派 subagent)

`intentionallyNotExported` 写入 `typedoc.json`(基础配置;check 经 `extends` 继承),格式「项目内相对路径:符号名」,24 条:

```
src/a11y/types.ts:CheckOverride
src/a11y/types.ts:ResolveProfileImpl
src/a11y/types.ts:FlattenLint
src/a11y/types.ts:Intersect
src/a11y/types.ts:Rule
src/a11y/types.ts:NameRequirement
src/a11y/types.ts:AsProfile
src/a11y/types.ts:OutputOf
src/a11y/types.ts:Exact
src/a11y/types.ts:FocusRequirement
src/a11y/types.ts:NoEmptyRequired
src/a11y/types.ts:NameEmptyCheck
src/a11y/types.ts:RoleDefiniteCheck
src/a11y/types.ts:PropsDefiniteCheck
src/a11y/types.ts:AriaAttrs
src/a11y/types.ts:FocusAttr
src/_internal/types.ts:UnionToIntersection
src/a11y/lints/_eslint.ts:EslintA11yProfile
src/a11y/lints/_bun.ts:BunA11yProfile
src/a11y/lints/_oxlint.ts:OxlintA11yProfile
src/a11y/lints/_biome.ts:BiomeA11yProfile
src/a11y/_internal.ts:OptionsKeyCheck
src/a11y/_internal.ts:LintSelectionCheck
src/a11y/_internal.ts:OutputDefiniteCheck
```

**验证:** `bun run doc:check` → 0 errors 0 warnings(exit 0)。防腐警告(条目未触发 / 符号已导出)为失败信号,逐条核对。

### Task 6: public-surface 核查 + 全链验证 + final review(controller)

- [ ] `rg public-surface src/` 断言与实际公开面一致(`SetTimer`、`PendingItem` 已入,无意外新导出)。
- [ ] 全链:`bun run doc:check`(0/0)、`bun run lint`、`bun run ts-check`、`bun run test`(全绿,覆盖率不降)、`bun run doc`(正常产出)。
- [ ] Final review:grok 4.6 xhigh,review package 为全部 task 的 BASE..HEAD,按 spec §2 裁决记录核对;有发现 → 一次 fix dispatch + 一次 scoped re-review。
- [ ] 交用户上 argus。
