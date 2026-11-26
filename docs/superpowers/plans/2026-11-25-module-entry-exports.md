# 模块入口与导出整改实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-11-25-module-entry-exports-design.md` 落实检视结论：重构 `src/a11y/lints/` 目录、同步生成器写入路径、修正 AGENTS.md 的示例与清单；`import { type X }` 混合写法先拆后撤（d88c46d 拆 9 处，实测推翻依据后已回退，见 spec §3.4）。公开面 25 → 21：四个 profile 类型移出，取法改为 `A11yBuiltinLints['biome']`，快照测试钉住名字集合。

**Architecture:** `lints/` 保持目录：四张生成表加 `_` 前缀（非公开），`A11yBuiltinLints` 挪进普通文件 `builtin.ts`，`index.ts` 退化为单行转发。`a11y-sync` 的写入路径与文件改名是同一原子改动。不扁平化、不动 `events/index.ts`、不改写历史文档。

**Tech Stack:** Bun 1.4.x、TypeScript 5.9.3（devDep）、Biome 2.x（含 `noImportCycles`）。

**Spec:** `docs/superpowers/specs/2026-11-25-module-entry-exports-design.md`

## Global Constraints

- 只用 bun；不引入其他运行时或打包器。
- 公开面 25 → 21：`BiomeA11yProfile` / `BunA11yProfile` / `EslintA11yProfile` / `OxlintA11yProfile` 移出公开面（1.0.3 之后按破坏性变更发版），取法改为 `A11yBuiltinLints['biome']`；`src/a11y/public-surface.test.ts` 快照钉住 `dist/a11y/index.d.ts` 的名字集合。
- `lints/` 不扁平化；四张表留在 `src/a11y/lints/` 下，只加 `_` 前缀。
- **文件改名与 `scripts/a11y-sync.ts` 的路径改动必须在同一个 commit。**
- 不改 `src/events/index.ts`（AGENTS.md 已列例外）。
- 不改写历史文档（`docs/superpowers/plans/2026-11-21-*`、`docs/requirements/a11y-design.md` 决策表里的旧路径保持原样）。
- 代码风格：Biome，单引号、分号、2 空格、80 列；提交信息用 conventional commits。

---

### Task 1: 规则基线——提交 AGENTS.md 重写版与 noImportCycles

**Files:**
- Commit: `AGENTS.md`（工作区已有 2026-11-25 重写版 + 下列修正）
- Commit: `biome.json`（工作区已有 `noImportCycles: error`）
- Add: `docs/superpowers/specs/2026-11-25-module-entry-exports-design.md`
- Add: `docs/superpowers/plans/2026-11-25-module-entry-exports.md`（本文件）

- [x] **Step 1: 修正 AGENTS.md 示例（先于提交，不留矛盾文本）**

「模块入口与导出」里组合类型的示例写的是扁平 `src/a11y/lints.ts`，与本设计的目录结构矛盾。把它替换为目录形式：

```ts
// src/a11y/lints/builtin.ts：普通文件，整份公开
import type { BiomeA11yProfile } from './_biome';

export interface A11yBuiltinLints {
  biome: BiomeA11yProfile;
}

// src/a11y/lints/index.ts：只转发，_ 文件不转发
export * from './builtin';
```

- [x] **Step 2: 补齐例外清单与分层清单（spec §3.5.2 / §3.5.3）**

「已知例外」补 4 项：`src/types/index.ts`（单文件模块，改名动 dist 布局）、`src/a11y/probe/`（维护者工具，不进产物，内部文件不加 `_`）、`src/browser/iife.ts`（打包入口，import `./index` 是其职责）、`*.test.ts` import `./index`（测公开面）。

分层清单补 2 项：`a11y`（自岛，不 import 其他模块）、`browser`（最上层，聚合全量）。

- [x] **Step 3: 提交**

```bash
git add AGENTS.md biome.json docs/superpowers/specs/2026-11-25-module-entry-exports-design.md docs/superpowers/plans/2026-11-25-module-entry-exports.md
git commit -m "docs: land the module entry/export rule and its design"
```

---

### Task 2: lints/ 目录重构（原子改动）

**Files:**
- Rename: `src/a11y/lints/biome.ts` → `src/a11y/lints/_biome.ts`（`bun` / `eslint` / `oxlint` 同理）
- Create: `src/a11y/lints/builtin.ts`（`A11yBuiltinLints` 自 `index.ts` 挪入）
- Modify: `src/a11y/lints/index.ts`（退化为单行转发）
- Modify: `src/a11y/types.test.ts:11-14`（import 指向 `_` 前缀）
- Modify: `scripts/a11y-sync.ts:195`（生成器写入 `_` 前缀路径）

**Interfaces:**
- Produces: `A11yBuiltinLints` 仍从 `@meld-ts/core/a11y` 公开导出；四张 profile 类型仍可用 `A11yBuiltinLints['biome']` 索引取到，不再从入口导出

- [x] **Step 1: 用 git mv 改名（保留历史）**

```bash
git mv src/a11y/lints/biome.ts src/a11y/lints/_biome.ts
git mv src/a11y/lints/bun.ts src/a11y/lints/_bun.ts
git mv src/a11y/lints/eslint.ts src/a11y/lints/_eslint.ts
git mv src/a11y/lints/oxlint.ts src/a11y/lints/_oxlint.ts
```

生成文件内容一个字都不改（`serializeProfile` 不嵌路径，已核对）。

- [x] **Step 2: 建 `builtin.ts`，`index.ts` 退化为转发**

`builtin.ts` 按 spec §3.1 的形状写（四个 `import type` + `export interface A11yBuiltinLints`，注释一并从 index.ts 挪过去）。`index.ts` 改成：

```ts
/**
 * 内置 lint 规则表汇总。
 *
 * 一个 lint 一个文件；更新单个 lint 整文件覆盖。
 * 四张表均由探针独立生成（bun 表不 aliasOf eslint，内嵌 oxlint 独立探测）。
 */
export * from './builtin';
```

- [x] **Step 3: 同步引用**

`src/a11y/types.test.ts`：`from './lints/biome'` → `from './lints/_biome'`（四行同理）。

`scripts/a11y-sync.ts:195`：

```ts
rel: `src/a11y/lints/_${lint.name}.ts`,
```

`src/a11y/types.ts:8` 与 `src/a11y/index.ts:12` 不动（都走 `'./lints'` 入口）。

- [x] **Step 4: 验证（全部通过才算完成）**

```bash
bun run lint && bun run ts-check && bun run test   # 649 pass / 49 skip / 0 fail，覆盖率 100%
bun run build
grep -oE '^export \{[^}]*\}' dist/a11y/index.d.ts | tr ',' '\n' | wc -l   # 21
rg -n "lints/(biome|bun|eslint|oxlint)\.ts" src/ scripts/ test/           # 0 命中
```

- [x] **Step 5: 提交（改名与生成器路径必须同commit）**

```bash
git add src/a11y/lints/ src/a11y/types.test.ts scripts/a11y-sync.ts
git commit -m "refactor(a11y): keep the lint tables private in _-prefixed files"
```

---

### Task 3: `import { type X }` 混合写法——先拆后撤（见 spec §3.4）

d88c46d 按当时的规则拆了 9 处（不止本 task 原列的 4 处；完整清单以 spec §3.4 的表为准，计划里不维护第二份易漂的清单）。2026-11-25 实测（tsc 5.9.3 + bun 1.4.x）推翻规则依据——bunup 产物无空 import，混合写法与拆行产物逐字节相同——AGENTS.md 删除该规则行，9 处全部回退为单语句混合写法。

**Files:** 以 spec §3.4 的表为准（d88c46d 与回退改的是同一批文件）。

- [x] **Step 1: 记录改动前的编译产物哈希**（d88c46d）

```bash
bun run build >/dev/null 2>&1
shasum dist/async/StatefulRpc.js
```

- [x] **Step 2: 逐处拆成两行**（d88c46d，9 处）

```ts
// 前：import { type TimerHandle, createTimer } from '../timer';
import type { TimerHandle } from '../timer';
import { createTimer } from '../timer';
```

- [x] **Step 3: 验证**（d88c46d：拆行后运行时产物不变）

```bash
bun run ts-check && bun run lint
bun run build >/dev/null 2>&1 && shasum dist/async/StatefulRpc.js   # 与 Step 1 一致：import type 已擦除，运行时产物不变
```

- [x] **Step 4: 提交**（d88c46d）

```bash
git add src/async/StatefulRpc.ts test/a11y/
git commit -m "refactor: split type-only imports from value imports"
```

- [x] **Step 5: 回退**（spec §3.4：9 处回退为单语句混合写法，AGENTS.md 删除该规则行并补「类型 import 与编译产物（实测）」小节）

---

### Task 4: 全量验证（含 a11y:sync 漂移检查）

- [x] **Step 1: 常规门**

```bash
bun run lint && bun run ts-check && bun run test && bun run build   # 全部 exit 0
```

- [x] **Step 2: a11y:sync 漂移检查（慢，2–4 分钟，装 lab 需网络）**

```bash
bun run a11y:sync
git status --short src/a11y/lints/   # 预期：无改动（生成器写新路径，内容与提交一致）
ls src/a11y/lints/                    # 预期：_biome.ts _bun.ts _eslint.ts _oxlint.ts builtin.ts index.ts
```

判定：旧路径文件（`biome.ts` 等）**不得重新出现**——这是「生成器与改名同步」的直接证据。表内容若因 lint 版本更新而漂移，属 roadmap 既有的漂移流程，单独处理，不算本计划失败。

- [x] **Step 3: 构建产物重载测试（发版前检查顺带跑）**

```bash
bun run test:a11y-build   # pass
```

- [x] **Step 4: 推送并确认 CI**

```bash
git push
gh pr checks 6 --watch   # check / ts-matrix ×3 / ts-matrix-ok / PR Agent review 全 pass
```

## 完成标准

- 检视报告的违规（spec §5 决策 1–5）全部处理：1–3、5 落地，4 先按旧规则拆 9 处（d88c46d）后按实测回退（spec §3.4）；豁免 4 项写进 AGENTS.md 例外清单。
- 公开面 25 → 21：四个 profile 类型移出，取法改为 `A11yBuiltinLints['biome']`，`src/a11y/public-surface.test.ts` 快照钉住；`noImportCycles` 通过；`a11y:sync` 写入新路径且旧文件不复活。
