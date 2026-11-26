# 模块入口与导出规则落地整改

- 日期：2026-11-25
- 状态：设计定稿，待实施
- 范围：`src/a11y/lints/` 结构、生成器写入路径、4 处 import 写法、`AGENTS.md` 规则文本与例外清单
- 关联：`AGENTS.md`「模块入口与导出」（2026-11-25 重写版）；PR #6（fix/star-exports）
- 前置：`AGENTS.md` 与 `biome.json`（`noImportCycles: error`）的重写已在工作区，随本设计一起提交

## 1. 背景

AGENTS.md 的「模块入口与导出」规则重写后，对 `src/` 做了一次逐条检视（2026-11-25）。结果：大部分符合；**2 处明确违规**、4 处按规则可豁免但未记录、AGENTS.md 自身有 1 处示例与规则矛盾、1 处分层清单缺项。

本设计把检视结论逐项落成可执行的改动。原则：**规则说好的必须做到；规则豁免的必须写进例外清单**。不留「大家都懂」的暗例外。

## 2. 检视证据（2026-11-25 实测）

| # | 检查 | 结果 |
|---|------|------|
| 1 | 逐个列举导出（`export { a, b } from`） | 全仓 0 处 ✓ |
| 2 | `noImportCycles`（biome.json，error 级） | 通过，无环 ✓ |
| 3 | 跨模块 import 走对方入口 | 全部合规（`../types`、`../guards`、`../timer`）✓ |
| 4 | `_` 文件不 import 同模块普通文件的值 | `a11y/_internal.ts` 只 `import type` 公开类型 ✓ |
| 5 | `index.ts` 不声明类型 | **`src/a11y/lints/index.ts:18` 声明 `A11yBuiltinLints`** ✗ |
| 6 | 非公开符号放 `_` 文件 | **四张表 `biome.ts` / `bun.ts` / `eslint.ts` / `oxlint.ts` 是普通文件名，但不是公开面** ✗ |
| 7 | 只为类型的 import 写 `import type { X }` | **4 处 `import { type X, value }` 混合写法** ✗（规则后撤，9 处已回退，见 §3.4） |
| 8 | AGENTS.md 示例与实际结构一致 | **示例写 `src/a11y/lints.ts`（扁平），与目录结构决策矛盾** ✗ |
| 9 | 分层清单完整 | **缺 `a11y`（自岛）与 `browser`（最上层）** ✗ |

## 3. 目标结构

### 3.1 `src/a11y/lints/`（核心改动）

保持 `lints/` 目录，不扁平化。前后对照：

| 改动前 | 改动后 | 角色 |
|---|---|---|
| `lints/biome.ts` | `lints/_biome.ts` | 生成表，非公开 |
| `lints/bun.ts` | `lints/_bun.ts` | 生成表，非公开 |
| `lints/eslint.ts` | `lints/_eslint.ts` | 生成表，非公开 |
| `lints/oxlint.ts` | `lints/_oxlint.ts` | 生成表，非公开 |
| `lints/index.ts`（声明 `A11yBuiltinLints`） | `lints/builtin.ts`（声明 `A11yBuiltinLints`） | 普通文件，整份公开 |
| （不存在） | `lints/index.ts` = `export * from './builtin'` | 纯转发 |

`builtin.ts` 的形状：

```ts
import type { BiomeA11yProfile } from './_biome';
import type { BunA11yProfile } from './_bun';
import type { EslintA11yProfile } from './_eslint';
import type { OxlintA11yProfile } from './_oxlint';

/** core 内置的 lint 规则表；声明为 interface 以支持声明合并。 */
export interface A11yBuiltinLints {
  eslint: EslintA11yProfile;
  bun: BunA11yProfile;
  oxlint: OxlintA11yProfile;
  biome: BiomeA11yProfile;
}
```

**为什么组合类型放普通文件而不是留在 index.ts**：规则第 3 条明文「index.ts 里不写实现，也不声明类型；组合出来的公开类型也放进普通文件，它用到的分部文件以 `_` 开头」。四张表用 `A11yBuiltinLints['biome']` 索引可达，不公开（规则第 1 条：能用索引类型取到的不公开）。

### 3.2 生成器路径（与 3.1 同一次改动，缺一不可）

`scripts/a11y-sync.ts:195`：

```ts
// 改动前
rel: `src/a11y/lints/${lint.name}.ts`,
// 改动后
rel: `src/a11y/lints/_${lint.name}.ts`,
```

**这不是「顺手改」，是同一原子改动的一半。** 只改文件名不改生成器，下一次 `bun run a11y:sync` 会把旧路径的四个文件重新写出来——新旧两套并存，`_` 前缀的私有性承诺被生成器自己推翻。

引用清单（2026-11-25 复核，含运行时拼接的路径）：

| 位置 | 形态 |
|---|---|
| `scripts/a11y-sync.ts:195` | 生成器写入路径（模板串） |
| `src/a11y/types.test.ts:11-14` | 静态 import |
| `src/a11y/probe/lints-sync.test.ts:65` | **运行时拼路径读文件**（检视第一轮漏掉，测试红了才暴露——路径构造不只 grep 字面量） |

已核对：`serializeProfile` 不在生成内容里嵌路径；`bunup.*.ts`、`typedoc.json` 无文件级引用（入口均走 `src/a11y/index.ts`）。

### 3.3 引用同步

| 位置 | 改动 |
|---|---|
| `src/a11y/types.test.ts:11-14` | `./lints/biome` → `./lints/_biome`（四个同理） |
| `src/a11y/types.ts:8` | 不变（`import type { A11yBuiltinLints } from './lints'` 走入口） |
| `src/a11y/index.ts:12` | 不变（`export * from './lints'`） |

### 3.4 `import { type X }` 混合写法——不设拆行规则（d88c46d 曾拆 9 处，已回退）

检视时曾把「只为类型的 import，写 `import type { X }`，不写 `import { type X }`。开了 verbatimModuleSyntax，后者编译后还留着一行 import，环照样在」当作规则：第一轮单行正则扫出 4 处，`rg -U --multiline` 复扫补齐 5 处，共 9 处混合 import 拆成两行（commit d88c46d）。2026-11-25 实测（tsc 5.9.3 + bun 1.4.x）推翻了它的技术理由，9 处全部回退为单语句混合写法：

- `import { type X } from './m'`（整条 import 只有类型）：tsc 开 `verbatimModuleSyntax` 时产物保留 `import {} from './m';`，不开该选项时完全擦除。
- 本仓库的 dist 由 bunup/bun 打包，空 import 完全消失——实测 `bun build` 对该写法 0 字节残留；混合写法 `import { type X, value }` 的产物与拆成两行的写法逐字节相同。
- 本仓库 tsc 只跑 `--noEmit`，从不产出 JS——「编译后还留着一行 import」的形态在本仓库任何产物里都不存在。
- 空 import 即使成环也无运行时危害：环上没有代码执行，不碰任何绑定。注意 `noImportCycles` 在源码层仍会把 `import { type X }` 这类整条类型 import 算进环并报错；`useImportType` 会先要求把它改成 `import type`，改完环即消失。别为此拆依赖层。

结论：AGENTS.md 已删除该规则行，另立「类型 import 与编译产物（实测）」小节记录依据；纯类型 import 的统一写法由 biome `useImportType`（recommended，已启用）执法；混合 import 不设拆行要求。

回退的 9 处（d88c46d 拆过、现在保持单语句混合写法）：

| 位置 |
|---|
| `src/async/StatefulRpc.ts`（events 多行 + timer 单行，两处） |
| `src/async/StatefulRpc.test.ts`（多行） |
| `src/async/retry.test.ts`（多行） |
| `src/async/retry-freeze.test.ts`（多行） |
| `src/traits/debuggable.test.ts`（多行） |
| `test/a11y/lint-union/index.ts`（单行） |
| `test/a11y/override-union/index.ts`（单行） |
| `test/a11y/override-unknown/index.ts`（单行） |
| `test/a11y/override-good/index.ts`（多行） |

教训仍然有效：扫写法类问题必须带多行模式（`rg -U --multiline`）——单行正则漏掉的正是折行后的多行 import。

### 3.5 AGENTS.md 文本修正

1. **示例改错**：现行示例画的是 `src/a11y/lints.ts`（扁平文件）+ `./_biome`，与 3.1 的目录结构矛盾。改成 `src/a11y/lints/builtin.ts` + `src/a11y/lints/index.ts` 的目录形式。
2. **例外清单**（规则里「已知例外」只有 events；补齐检视中判定豁免的 4 项）：
   - `src/types/index.ts`：types/ 目录只有这一个文件，实质是单文件模块；改为 `src/types.ts` 会动 dist 布局与 `package.json` 的 types 路径，收益为零。
   - `src/a11y/probe/`：维护者工具，不进 `exports` 与 browser 产物；内部 10 个普通文件（detect、serialize…）不加 `_` 前缀，`scripts/` 与 `src/bin/` 深导入它们（bin 是维护者 CLI 入口，与 scripts 同类调用方）。
   - `src/browser/iife.ts`：打包入口，`import * from './index'` 是它的职责；自列模块清单会与 index.ts 重复一份易漏的列表。
   - `*.test.ts` import `./index`：测试测的就是公开面，且测试不进 import 图、不会成环。
3. **分层清单补两项**：`a11y`（自岛——不 import 任何其他模块）；`browser`（最上层——聚合全量公开面）。

## 4. 不改的东西

| 项 | 理由 |
|---|---|
| `src/events/index.ts` 的实现 | AGENTS.md 已列的已知例外；调整单独提案，不顺手改 |
| 公开面 | 修正：并非「21 个名字不变」——对照 main 实测是 25 → 21，`BiomeA11yProfile` / `BunA11yProfile` / `EslintA11yProfile` / `OxlintA11yProfile` 移出公开面（1.0.3 之后按破坏性变更发版，取法改为 `A11yBuiltinLints['biome']`）；名字集合由 `src/a11y/public-surface.test.ts` 快照钉住 |
| `lints/` 目录扁平化 | 保持目录。四张表 1.4 万行生成数据留在子目录，`a11y/` 根只放 `_internal.ts`、`aria.generated.ts`、`builtin` 链路、`createA11y.ts`、`types.ts`、`index.ts` |
| 历史文档里的旧路径 | `docs/superpowers/plans/2026-11-21-*`、`docs/requirements/a11y-design.md` §决策表里的 `lints/bun.ts` 等是历史记录，不改写 |

## 5. 决策记录

| # | 检视发现 | 决策 | 依据 |
|---|---|---|---|
| 1 | `lints/index.ts` 声明组合类型 | **修**（§3.1） | 规则第 3 条 |
| 2 | 四张表普通文件名但非公开 | **修**（§3.1） | 规则第 1、2 条 |
| 3 | 生成器写旧路径 | **修**（§3.2） | 改名与生成器是同一原子改动 |
| 4 | 4 处 `import { type X }` | **不设规则**（§3.4）：d88c46d 曾按旧规则拆 9 处，实测推翻理由后回退 | bunup 产物无空 import；混合写法与拆行的产物逐字节相同 |
| 5 | AGENTS.md 示例与结构矛盾 | **修**（§3.5.1） | 规则文本自身正确性 |
| 6 | 4 项豁免未记录 | **记入例外清单**（§3.5.2） | 不留暗例外 |
| 7 | 分层清单缺 a11y / browser | **补**（§3.5.3） | 清单完整性 |
| 8 | `types/index.ts` 单文件模块 | **不动**，记例外 | 改名动 dist 布局，收益为零 |
| 9 | probe/ 内部命名 | **不动**，记例外 | 不进产物，改名纯命名游戏 |
| 10 | `browser/iife.ts` import `./index` | **不动**，记例外 | 打包入口的职责 |
| 11 | 测试 import `./index` | **不动**，记例外 | 测公开面正是测试该做的 |
| 12 | 公开面 25 → 21（四个 profile 类型移出） | **保持 21**，如实记录（§4），快照测试 `src/a11y/public-surface.test.ts` 钉住 | 1.0.3 已发布的公开类型被移除属破坏性变更，按 major 发版并在 release note 写明替代写法 `A11yBuiltinLints['biome']` |

## 6. 验证

每一步都是可执行的命令与预期输出：

1. `bun run lint`（含 `noImportCycles`）→ 0 error
2. `bun run ts-check` → exit 0
3. `bun run test` → 657 pass / 49 skip / 0 fail，覆盖率 100%（含 `lint/` 下插件 fixture 回归测试 7 条与公开面快照测试 1 条）
4. `bun run build` → exit 0；`dist/a11y/index.d.ts` 的 `export { ... }` 为 21 个名字——对照 main 的 25 个，移出的是四个 profile 类型（见 §4），名字集合由 `src/a11y/public-surface.test.ts` 钉住
5. `bun run a11y:sync`（慢，2–4 分钟）→ 生成文件全部落在 `_` 前缀新路径；`git status` 中不出现旧路径的 `lints/biome.ts` 等四个文件。表内容若因 lint 版本更新漂移，走 roadmap 既有的漂移流程，不属本次改动
6. `bun run test:a11y-build` → pass（发版前检查，本次顺带跑）
7. `rg -n "lints/(biome|bun|eslint|oxlint)\.ts" src/ scripts/ test/` → 0 命中（生成器与 import 均已切到 `_` 前缀）

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 生成器漏改路径，`a11y:sync` 重新写回旧文件 | §3.2 已核对全仓只有一处路径构造；验证第 5、7 条专门拦这个 |
| 改名后 CI / typedoc / bunup 引用断链 | 已核对三处入口（typedoc.json、bunup 配置、tsconfig 均为通配/入口引用），无文件级引用；验证第 1–4 条兜底 |
| 历史文档与现状不一致 | §4 已声明不改写历史记录；现行文档以本设计为准 |
