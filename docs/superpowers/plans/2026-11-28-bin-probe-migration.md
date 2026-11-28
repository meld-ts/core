# bin 与 a11y probe 迁出 src 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/bin/` → `bin/`、`src/a11y/probe/` → `bin/a11y-probe/`,bin 不再受 src 的覆盖率与 JSDoc 门禁约束;附带修复 `lint/fixtures/` 夹具被 `577c826` 重排导致的 4 个测试失败,并加 biome 防御排除。全链(test / test:bin / lint / ts-check / doc:check / build / a11y 三件套)全绿。

**Architecture:** 纯搬移 + 引用更新 + 配置调整,不改运行时逻辑。依赖事实与改动清单见 spec §3–§4:probe 自包含、`src/bin` 只依赖 probe、外部仅 4 个 scripts 引用。

**Tech Stack:** Bun、tsdown、Biome、typedoc 0.28.19(不动)

**Spec:** `docs/superpowers/specs/2026-11-28-bin-probe-migration-design.md`(§4 改动清单、§6 决策记录)

**执行方式:** 写码 subagent 用 GLM 5.3 max(`bottlerocket/zai-org/GLM-5.3#max`),串行,每 task 过 task review(grok 4.6 xhigh);Task 4–5 由 controller 执行;final review 后交用户上 argus。

## Global Constraints

- AGENTS.md 全部规则;`lint/fixtures/` 不做格式化或重排(代码规范 4,2026-11-28 新增)。
- 只动 spec §4 列出的文件与点位;生成文件(`*.generated.ts`、`lints/_*.ts`)内容不动(搬移除外),数据更新不与本任务混提交。
- probe 目录内部结构原样搬,不改名、不重组、不顺手重构。
- `dist/bin/meld-ts.js` 产物路径与 `package.json` 的 `bin` 字段不变。
- 改完格式化:`bun fmt <文件路径>`;`lint/fixtures/` 永不格式化。
- 每 task 一个 commit(conventional,中文 subject)。
- `docs/reviews/` 是历史记录,不改;活文档(docs/a11y.md、a11y-design.md、roadmap)的路径引用要同步。

---

### Task 1: 前置修复——lint/fixtures 恢复 + biome 防御排除

**Files:**
- Modify: `lint/fixtures/`(28 个文件,恢复到 593f6d6 形态)
- Modify: `biome.json`

**要求:**
- [ ] `git checkout 593f6d6 -- lint/fixtures/` 恢复夹具原形态(已被 577c826 格式化重排:`noExportedImports` 诊断数变化,4 用例失败)。
- [ ] `biome.json` 的 `files.includes` 数组追加 `"!lint/fixtures"`(防御性排除,与 `!docs`、`!dist` 同风格;放在列表末尾)。

**验证:**
- `bun test lint/no-cross-file-reexport.test.ts` → 12/12 全绿
- `bun run test` → **全绿**(4 个失败消失)
- `bunx biome check lint/fixtures/ 2>&1 | tail -1` → 确认 biome 跳过该目录(ignored 或 no files checked)

### Task 2: 迁移主刀——搬移、import、配置

**Files:**
- Move: `src/bin/meld-ts.ts`、`src/bin/meld-ts.test.ts` → `bin/`
- Move: `src/a11y/probe/`(整个目录)→ `bin/a11y-probe/`
- Modify: `bin/meld-ts.ts`、`bin/meld-ts.test.ts`(import 路径)
- Modify: `scripts/a11y-sync.ts`、`scripts/a11y-build-test.ts`、`scripts/a11y-lint-test.ts`、`scripts/lab.ts`(import 路径 + a11y-sync 的 2 处硬编码生成路径)
- Modify: `tsdown.bin.ts`、`biome.json`、`bunfig.toml`、`package.json`、`lefthook.yml`、`.github/workflows/pr-check.yml`

**要求:**

搬移(用 `git mv` 保历史;先建 `bin/` 目录):
- [ ] `src/bin/meld-ts.ts`、`src/bin/meld-ts.test.ts` → `bin/`
- [ ] `src/a11y/probe` → `bin/a11y-probe`(目录内容原样)

import 更新:
- [ ] `bin/meld-ts.ts`:`../a11y/probe` → `./a11y-probe`(12 处 import)
- [ ] `bin/meld-ts.test.ts`:同上(`./meld-ts` 不动)
- [ ] 4 个 scripts:`../src/a11y/probe` → `../bin/a11y-probe`
- [ ] `scripts/a11y-sync.ts` 内 2 处硬编码:`rel: 'src/a11y/probe/samples.generated.ts'`、`'src/a11y/probe/profiles.generated.ts'` → `bin/a11y-probe/...`

配置(spec §4.4 逐项):
- [ ] `tsdown.bin.ts`:entry → `['bin/meld-ts.ts']`
- [ ] `biome.json`:`files.includes` 加 `"bin/**/*.{ts,js}"`;noNodejsModules 的 override 简化为 `["src/**", "!**/*.test.ts"]`
- [ ] `bunfig.toml`:删除 `coveragePathIgnorePatterns = ["src/bin/**"]` 一行
- [ ] `package.json`:新增 `"test:bin": "bun test bin/"`(**不带** `--coverage`);`fmt:all` 与 `lint` 的目标列表加 `./bin`
- [ ] `.github/workflows/pr-check.yml`:`Test` 步骤后新增一步跑 `bun run test:bin`(先读现有 yaml 结构,保持风格一致)
- [ ] `lefthook.yml`:pre-commit 的 `git add -u` 范围加 `bin/`
- [ ] `tsconfig.json` 不动

**验证(全链):**
- `bun run test` → 全绿,覆盖率 100% 不降(probe 退出统计)
- `bun run test:bin` → bin 的 12 个测试文件全绿
- `bun run lint`、`bun run ts-check`、`bun run doc:check`(0/0)全过
- `bun run build` → `dist/bin/meld-ts.js` 产出,`bun run test:a11y-build` 全绿

### Task 3: 文档同步

**Files:**
- Modify: `docs/a11y.md`、`docs/requirements/a11y-design.md`、`docs/requirements/a11y-roadmap.md`

**要求:**
- [ ] 三个活文档中 `src/a11y/probe` → `bin/a11y-probe`、`src/bin` → `bin`(读上下文逐处替换,措辞按新结构微调)
- [ ] `docs/reviews/`、`docs/superpowers/` 历史记录**不改**

**验证:**
- `rg -n 'src/bin|a11y/probe' --glob '!docs/superpowers/**' --glob '!docs/reviews/**' --glob '!node_modules' --glob '!dist' --glob '!docs/typedoc'` → 0 处旧路径残留

### Task 4: a11y:sync 完整验证(controller 执行,不派 subagent)

- [ ] `bun run a11y:sync` 完整跑(lab 装最新 lint,数分钟),确认 `samples.generated.ts`、`profiles.generated.ts` 写入 `bin/a11y-probe/`
- [ ] 表内容 diff(`src/a11y/lints/_*.ts`、`aria.generated.ts` 等数据变化)→ `git checkout` 还原,数据更新以后单独提交,不与搬目录混
- [ ] 还原后 `bun run test:a11y-lint` 全绿(按表头版本精确安装,验证提交进仓库的版本)
- [ ] final 全链复跑:`bun run test`、`bun run test:bin`、`lint`、`ts-check`、`doc:check`、`build`、`test:a11y-build`

### Task 5: final review(controller 派 grok 4.6 xhigh)

- [ ] review package = 全部 task 的 BASE..HEAD,按 spec §2–§6(目标结构、依赖事实、决策记录)核对
- [ ] 有发现 → 一次 fix dispatch + 一次 scoped re-review
- [ ] 交用户上 argus
