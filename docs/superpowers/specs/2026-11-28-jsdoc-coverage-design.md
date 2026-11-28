# src JSDoc 补全与 doc:check 门禁清零

- 日期:2026-11-28
- 状态:设计定稿,待实施
- 范围:`src/` 下 8 个文件的 JSDoc 补全、2 个类型导出、`UnionToIntersection` 归置、`typedoc.json` 豁免名单
- 排除:`src/bin/`、`src/a11y/probe/`、`*.test.ts`(迁出 src/ 是第二个任务);`AGENTS.md`(禁 AI 修改,另行建议)
- 关联:`AGENTS.md`「JSDoc」「模块入口与导出」;`docs/a11y.md`、`docs/requirements/a11y-design.md`(a11y 术语依据)
- 前置:无

## 1. 背景

`bun run doc:check` 现状 56 条 warning(`treatValidationWarningsAsErrors` 下 exit 4)。分四类:

| 类 | 数量 | 性质 |
|----|------|------|
| A | 16 | 公开符号(TypeAlias/Interface/Variable)无文档 |
| B | 10 | 成员无文档(方法签名、属性、类型参数) |
| C | 4 | `@param` 错位(解构参数点号写法、overload 归属) |
| D | 26 | 未导出类型被公开符号引用(referenced but not included) |

A+B+C 共 30 条是纯 JSDoc 缺失,直接按规范补。D 类逐个裁决,见 §2。

目标:`bun run doc:check` **0 error 0 warning**,其余全链不回归。

## 2. D 类裁决记录(26 条)

这是本次讨论的决策档案,review 时按此核对。

### 2.1 裁决总表

| 符号 | 所在文件 | 裁决 | 依据 |
|------|---------|------|------|
| SetTimer | src/timer.ts | **导出 + JSDoc** | TimerCustomMode.set 的实现者就是使用方,导出后可引用 `set: SetTimer<number>` 等写法 |
| PendingItem | src/async/StatefulRpc.ts | **导出 + JSDoc** | protected 扩展点 `newPendingItem`/`addPendingItem` 的参数类型,子类实现时要构造此结构 |
| CheckOverride、ResolveProfileImpl、FlattenLint、Intersect、Rule、NameRequirement、AsProfile、OutputOf、Exact、FocusRequirement、NoEmptyRequired、NameEmptyCheck、RoleDefiniteCheck、PropsDefiniteCheck(14 个) | src/a11y/types.ts | **不导出,注册豁免** | 类型机器:推导原料 + 调用点报错门。导出等于承诺报错机制的稳定性,使用方永远不该 import |
| AriaAttrs | src/a11y/types.ts | **不导出,注册豁免** | `aria-*` 输出键计算器(与公开的 `A11yAttrs` 是两个名字) |
| FocusAttr | src/a11y/types.ts | **不导出,注册豁免** | focusable → tabindex 输出计算器 |
| UnionToIntersection | src/traits/implTraits.ts(现) | **移至 src/_internal/types.ts + 注册豁免** | 全局工具类型去重归置(见 §3.3);仍不导出,警告靠注册 |
| EslintA11yProfile、BunA11yProfile、OxlintA11yProfile、BiomeA11yProfile(4 个) | src/a11y/lints/_*.ts | **不导出,注册豁免** | 生成文件勿手改;2026-11-25 module-entry-exports 设计明文「四张表文件以 `_` 开头,不转发」 |
| OptionsKeyCheck、LintSelectionCheck、OutputDefiniteCheck(3 个) | src/a11y/_internal.ts | **不导出,注册豁免** | 文件头明文「本文件不在入口,等于私有」 |

### 2.2 裁决原则(用户 2026-11-28 拍板)

1. 被公开类型引用的类型,应该思考是否导出——类型无法复用是真实痛点。
2. 但内部类型机器(推导原料、报错门)当初就是按内部设想命名的,导出就要承担全局命名规范与 API 稳定性承诺;本仓裁决为不导出、走注册。
3. 不接受整类关闭检查(`validation.notExported: false`)的粗放豁免;逐符号注册,检查保持开启。

### 2.3 已排除的路径(实验记录,2026-11-28 实测)

| 路径 | 结果 |
|------|------|
| 文件级 `exclude` | 无效:只作用于入口 glob 展开,被 import 的文件管不着 |
| `externalPattern` 伪装外部文件 | 无效:内部符号不走 external 判定 |
| `/** @hidden */` 行注释挂未导出类型 | 无效:CommentPlugin 只遍历已进文档的符号,未导出类型的注释根本不解析 |
| `excludeNotDocumented` | 否决:会把 30 个点位的 notDocumented 门禁一起关掉 |
| 搬入 `a11y/_internal.ts` | 否决:`types.ts ⇄ _internal.ts` 结构性环(biome `noImportCycles` error 拦),且 `a11y/_internal.ts` 文件头注释明文记录过 `Exact` 当年因此不搬 |
| 14 个类型就地全导出 | 否决(用户裁决):连带 9 个下游计算器(NoEmpty、OutValue、Str、AllEmptyIds、TabKey、TabVal、IsUnion、EmptyValueKeys、EmptyValueScope)全部被迫公开,公开面膨胀 |
| typedoc 升级 0.28.20 | 无收益:56 条警告与 `@hidden` 实验行为完全不变 |
| typedoc 1.0.0-dev.4 | 不可用:三个插件(material-theme、merge-modules、expand-object-like-types)全部加载失败 |

**typedoc 版本保持 0.28.19 不动。**

## 3. 改动清单

### 3.1 JSDoc 补全点位(30 条)

按文件分组。每处的「补什么」是内容要点,执行者必须读源码后依据实际代码逻辑写,禁止空洞转述。

**src/timer.ts**

| 符号 | 要点 |
|------|------|
| `TimerMode`(A) | 三种模式语义:`'timeout'`(setTimeout,一次性)/`'interval'`(setInterval,循环)/自定义对象(覆盖平台定时器:requestAnimationFrame、测试 fake timer 等场景) |
| `TimerCustomMode`(A) | 自定义模式实现接口;`@typeParam Id`(从 `set` 返回值推断,`clear` 接收同类型) |
| `TimerCustomMode.clear`(B) | 按 `set` 返回的 id 清除 |
| `TimerOptions`(A) | 三属性语义 + 索引签名说明;`@defaultValue`(prefix 无前缀、mode `'timeout'`) |
| `TimerOptions.onError`(B) | 触发时机(回调同步抛错或返回的 Promise reject)、参数 `(error, fullKey)`,fullKey 带前缀;不传则静默 |

**src/path.ts**

| 符号 | 要点 |
|------|------|
| `DirectorySeparator`(A) | 支持的分隔符字面量 |
| `PathInput`(A) | 允许 null/undefined/空串,按空处理 |
| `UnixDS`(A) / `WinDS`(A) | 常量用途:separator 缺省取 UnixDS;WinDS 供 Windows 风格显式指定 |
| `PathReplacementCallback`(A) | 回调契约:参数 `(path, separator)`、返回替换后字符串;执行时机引用 dangerReplace/duplicateReplace 属性文档 |
| `PathUtilsOptions`(A) | 顶层说明;`separator` 属性本身也缺文档,一并补(空串默认 `/`,多字符取首字符——与实现一致) |
| `createPathUtils` 的 3 条 `@param`(C) | 解构参数下 typedoc 不识别 `options.xxx` 点号写法(0.27 的 `@param options.foo` 支持「limited to references」,不适用解构):收敛为 `@param options` 一条,字段细节引用 `PathUtilsOptions` 属性文档 |

**src/events/index.ts**

| 符号 | 要点 |
|------|------|
| `MaybePromise`(A) | 回调可同步可异步 |
| `EventsEmitter.on`(B) | 返回反注册函数;`isOnce` 语义 |
| `EventsEmitter.off(name)` / `off(name, callback)`(B×2) | 注释只挂在第一个 overload 上,后两个签名各自补;按引用匹配移除 |
| `EventsEmitter.emit`(B) | 监听器并发执行(Promise.all);监听器抛错/reject 转 `onError`,emit 自身不 reject |
| `EventsEmitterOptions`(A) | 顶层说明 |
| `EventsEmitterOptions.onError`(B) | `(err, name)` 时机;不传静默 |
| `LinkEventMode`(A) | `'on'`/`'once'`/`'off'` 三种模式语义(linkEvents 第三参) |

**src/singleton.ts**

| 符号 | 要点 |
|------|------|
| `singleton` 的 `@typeParam F`(B) | F 从 factory 参数推断;返回 `(...args: Parameters<F>) => ReturnType<F>`,同参同返回 |

**src/traits/configurable.ts**

| 符号 | 要点 |
|------|------|
| `Configurable`(A) | 接口顶层说明(六个方法已有文档) |

**src/traits/debuggable.ts**

| 符号 | 要点 |
|------|------|
| `DebugConfiguration.format`(B) | `(vars, styles) => string[]`;返回传给 `console.log` 的参数数组;与 `method` 的关系 |

**src/async/retry.ts**

| 符号 | 要点 |
|------|------|
| `sleep` 的 `@param fn`(C) | JSDoc 挂在实现签名上被绑定到无 fn 的第一个 overload:拆到两个 overload 声明前,各写各的 `@param`;实现上方不留 JSDoc |

**src/a11y/types.ts**

| 符号 | 要点 |
|------|------|
| `ResolveProfile`(A) | lint 选择 → 生效表:单名 → 内置表;多名/数组 → MergeProfiles 合并(supported 取交集) |
| `A11yInput`(A) | 输入形状:必填键必选、支持键可选(可 undefined)、focusable、名字规则随 role |
| `A11yAttrs`(A) | 输出形状:role + `aria-*` 键 + tabindex 规则 + 空值键消失 |
| `A11y.aria`(B) | 原生元素补状态,不带 role;拦 union props |

**改 `src/a11y/` 前先读 `docs/a11y.md`(用法)和 `docs/requirements/a11y-design.md`(设计),术语与两文档对齐。**

### 3.2 导出 + JSDoc(D-1)

| 符号 | 动作 |
|------|------|
| `SetTimer`(src/timer.ts) | `export type SetTimer` + JSDoc;timer.ts 是入口文件直接导出即可 |
| `PendingItem`(src/async/StatefulRpc.ts) | `export type PendingItem` + JSDoc;经 `src/async/index.ts` 的 `export *` 自动转发 |

两者导出后 notDocumented 即生效,JSDoc 必写。公开面变化需同步更新 public-surface 断言(见 §3.6)。

### 3.3 UnionToIntersection 归置

1. 新建 `src/_internal/types.ts`:定义 `UnionToIntersection`(从 `src/traits/implTraits.ts` 搬,带简短 JSDoc 说明用途);
2. `src/_internal/index.ts` 增加 `export * from './types'`(内部转发,包入口不导出 `_` 目录,合规);
3. `src/traits/implTraits.ts`:删本地定义,`import type { UnionToIntersection } from '../_internal'`;
4. `src/a11y/types.ts`:删本地定义(L73–79),同上 import;
5. 依 AGENTS.md「搬文件、改名」:`rg UnionToIntersection` 确认无遗漏引用,不留转发。

无环:`src/_internal/` 不依赖 a11y/traits。纯类型搬移,不影响运行时。

### 3.4 typedoc.json 豁免名单

`intentionallyNotExported` 共 **24** 个(§2.1 全部「注册豁免」项),写入 **`typedoc.json`**(基础配置;`typedoc.check.json` 经 `extends` 自动继承,两命令行为一致)。

条目格式用「项目内相对路径:符号名」(相对仓库根目录,如 `src/a11y/types.ts:CheckOverride`)。typedoc 0.28.19 实测可用(2026-11-28,登记 `src/a11y/lints/_biome.ts:BiomeA11yProfile` 后对应 referenced 警告消失)。每个名字自带位置、可读且杜绝同名误伤。

名单(24):

```
src/a11y/types.ts:CheckOverride        src/a11y/types.ts:ResolveProfileImpl
src/a11y/types.ts:FlattenLint          src/a11y/types.ts:Intersect
src/a11y/types.ts:Rule                 src/a11y/types.ts:NameRequirement
src/a11y/types.ts:AsProfile            src/a11y/types.ts:OutputOf
src/a11y/types.ts:Exact                src/a11y/types.ts:FocusRequirement
src/a11y/types.ts:NoEmptyRequired      src/a11y/types.ts:NameEmptyCheck
src/a11y/types.ts:RoleDefiniteCheck    src/a11y/types.ts:PropsDefiniteCheck
src/a11y/types.ts:AriaAttrs            src/a11y/types.ts:FocusAttr
src/_internal/types.ts:UnionToIntersection
src/a11y/lints/_eslint.ts:EslintA11yProfile
src/a11y/lints/_bun.ts:BunA11yProfile
src/a11y/lints/_oxlint.ts:OxlintA11yProfile
src/a11y/lints/_biome.ts:BiomeA11yProfile
src/a11y/_internal.ts:OptionsKeyCheck
src/a11y/_internal.ts:LintSelectionCheck
src/a11y/_internal.ts:OutputDefiniteCheck
```

typedoc 对名单有防腐检查(2026-11-28 实测):登记了不存在的文件/符号、或符号其实已导出,报「marked as intentionally not exported, but were either not referenced … or were exported」;`treatValidationWarningsAsErrors` 下这条警告直接让 doc:check 失败。名单不会腐烂,改动类型时必须同步名单(见 AGENTS.md JSDoc 第 6 条)。

### 3.5 JSDoc 写作规范(执行约束)

1. 中文;标识符、API 名、专有术语英文(AGENTS.md)。
2. 类型/接口按复杂程度决定 `@example`(AGENTS.md:type、interface 看复杂程度;本任务以类型为主,`A11yInput`/`A11yAttrs` 这类复杂形状建议配)。
3. 会抛错、返回 Promise 会 reject 的写 `@throws`(如 `emit` 对 onError 自身抛错的行为、`sleep` 的 fn 同步抛错)。
4. 泛型写 `@typeParam`:推断来源、返回类型怎么变。
5. 每个属性/方法都写;有默认值的可选属性写 `@defaultValue`。
6. **禁止空洞文档**:每句话的事实都要能在源码指出处;「定时器选项」这类转述名字的文档视为不合格。
7. 只写使用方视角需要知道的;实现里已有的 WHY 注释一律不动。
8. 除 §3.2/§3.3 列明的导出与搬移外,不改任何运行时代码、不改现有类型定义结构。

### 3.6 公开面断言与测试同步

- `rg public-surface` 找到 timer/async 相关的公开面断言,补入 `SetTimer`、`PendingItem`;
- a11y 公开面不变(AriaAttrs、FocusAttr 不导出);
- `lint/` 下的 d.ts 消费测试与新公开类型一并验证。

## 4. 验证标准

全部通过才算完成:

1. `bun run doc:check` → **0 errors 0 warnings**(exit 0)
2. `bun run lint`(含 noImportCycles)
3. `bun run ts-check`
4. `bun run test` → 711+ 全绿,覆盖率不降
5. `bun run doc` → 正常产出
6. `rg UnionToIntersection` → 只剩 `src/_internal/types.ts` 定义与两处 import

## 5. 执行方式

- 写码 subagent 用 GLM 5.3 max,按文件分组并行(互不重叠):
  - S1:`src/timer.ts` + `src/singleton.ts`
  - S2:`src/path.ts` + `src/events/index.ts`
  - S3:`src/traits/configurable.ts` + `src/traits/debuggable.ts` + `src/async/retry.ts` + `src/async/StatefulRpc.ts`
  - S4:新建 `src/_internal/types.ts` + 改 `src/traits/implTraits.ts`、`src/a11y/types.ts` 的 import(§3.3 的 1–4 步)+ `src/a11y/types.ts` 的 4 个 JSDoc 点位。UnionToIntersection 的归置与 a11y/types.ts 的 JSDoc 改同一个文件,合并给一个 subagent 串行完成,不与 S3 撞(implTraits.ts 只归 S4,S3 不碰);前置:读 `docs/a11y.md`、`docs/requirements/a11y-design.md`
- `typedoc.json` 名单由主会话统一改(避免并发写同一文件),在 subagent 完成后进行;
- 全链验证由主会话统一跑;review 用 grok 4.6 xhigh,按本设计(尤其 §2 裁决记录)核对;
- review 意见修复后,交用户上 argus。

## 6. 明确不做的事

- 不动 `src/bin/`、`src/a11y/probe/`、`*.test.ts`(第二个任务);
- 不动 `AGENTS.md`(建议见 §7);
- 不导出、不移动 24 个注册名单里的符号(UnionToIntersection 除外,它是归置不是导出);
- 不升级 typedoc(保持 0.28.19,理由见 §2.3);
- 不改动 30 个点位之外的 JSDoc、不做顺手重构。

## 7. AGENTS.md 落实记录

本设计的建议已于 2026-11-28 由用户写入 `AGENTS.md`「JSDoc」第 5、6 条:referenced 警告按「使用方会直接写出名字的导出,内部推导/报错用的登记」裁决;登记条目随改名/移动/删除/导出同步,禁止 `validation.notExported: false` 整类关闭。
