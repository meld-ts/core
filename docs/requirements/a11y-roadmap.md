# @meld-ts/core/a11y 整体进度

> 设计依据：[a11y-design.md](./a11y-design.md)。
> 按子系统拆成三份计划，每份独立可交付、独立验收。

## 总览

| 计划 | 内容 | 状态 | 交付物 |
|---|---|---|---|
| **A** 类型核心与运行时 | 类型机器 + `createA11y` 运行时 + 手写缩小版数据 | ✅ 已完成（2026-11-21） | `src/a11y/` 全部、子路径 `@meld-ts/core/a11y` |
| **B** 探针与全量数据 | 探针 + `a11y:sync`，从真实 lint 生成全量规则表 | ✅ 已完成（2026-11-22） | `probe/`、`aria.generated.ts` 全量、`lints/` 四张表 |
| **C** CLI 与用户侧闭环 | `meld-ts a11y probe`、用户模式重载、一致性/反向/产物测试 | ✅ 已完成（2026-11-22） | `src/bin/meld-ts.ts`、一致性测试、AGENTS 规则 |

依赖关系：B 依赖 A 的类型契约（`A11yProfile` 字面量形状）；C 依赖 A + B。

三个计划（A / B / C）均已完成（2026-11-22）；日常门禁见「进度核查方法」，a11y 专项与发版前检查见下文「发版前检查（a11y）」。

---

## Plan A：类型核心与运行时（已完成）

**目标**：按 lint 规则表在类型层约束 aria 属性输入、精确推断输出；只经 exports 子路径提供 `createA11y`，不导出默认实例。

**执行记录**：分支 `feat/a11y`，2026-11-21，SDD 流程（每任务独立实现 + 审查），commit 数以 `git log --oneline main..feat/a11y` 为准。

| Task | 内容 | 状态 |
|---|---|---|
| 1 | 数据层类型（手写缩小版：4 role × biome/oxlint） | ✅ |
| 2 | 注册表与重载检查（`A11yLintOverrides`、`OverrideKeyCheck`、4 个 tsc fixture） | ✅ |
| 3 | 输入输出类型、多 lint 合并、选项解析 | ✅ |
| 4 | `createA11y` 运行时实现 + 单测 | ✅ |
| 5 | 接线（bunup / browser / exports / README / CLAUDE.md） | ✅ |
| 6 | 全量验证（fmt / lint / ts-check / test） | ✅ |

**验收方式**：

```bash
bun run ts-check   # 类型断言（含 @ts-expect-error）全部生效
bun run lint       # 0 warning
bun run test       # 449 pass / 39 skip / 0 fail；src/a11y 覆盖率 100%（round 13 实测计数）
ls dist/a11y       # esm/cjs/d.ts/d.cts 四产物
grep -A4 '"./a11y"' package.json
```

**说明**：本计划的数据是**手写缩小版**（biome 2.6.8 / oxlint 1.94.0，仅 switch / img / separator / combobox 四个 role），不是全量数据。文件头已注明会被 Plan B 整文件覆盖。**（2026-11-22：Plan B 已用探针生成的全量表整文件替换。）**

**终审**：无 Critical；3 条 Important（typedoc 入口、`skills/meld-ts-core/SKILL.md`、`docs/reviews/` 记录）已修复并复审通过。

**计划文档**：[2026-11-21-a11y-plan-a.md](../superpowers/plans/2026-11-21-a11y-plan-a.md)

---

## Plan B：探针与全量数据（已完成）

**目标**：用探针从真实 lint 生成全量规则表，替换 Plan A 的手写缩小版。核心理由见设计 §2：规则表只能从 lint 本身实测，不能凭规范手写。

**执行记录**：分支 `feat/a11y`，2026-11-22，SDD 流程（8 个任务，每任务独立实现 + 审查）。首次真实同步（Task 7，`5fdc608`）生成四张表：**eslint 6.10.2**（表版本取 jsx-a11y 插件的版本）、**bun 1.4.4**、**oxlint 1.94.0**、**biome 2.6.8**；127 个非抽象 role × 51 个 AriaKey，连续两次 sync 逐字节一致（确定性成立）。**bun 1.4.4 起 `bun lint` 内嵌 oxlint**：JSON 是 oxlint 形状（`diagnostics[].code = jsx-a11y(...)`），需 `--jsx-a11y-plugin` 打开插件（`--rule` 才生效）、`--no-script` 防止转去执行项目 lint 脚本；bun 表独立探测生成，不 aliasOf eslint。其余事实见设计稿 §12.11。

**交付物**：

- `src/a11y/aria.generated.ts`：全量（aria-query 127 个 role、全部 ARIA 属性、名字规则、idlist/id 分类）
- `src/a11y/probe/samples.generated.ts`：每个属性的合法样例值
- `src/a11y/probe/`：detect（发现项目里的 lint 与版本）、fixtures、exec（可注入子进程）、runners（四个 lint）、serialize
- `scripts/a11y-sync.ts`：维护者模式，建 lab、装最新 lint、跑探针、覆盖写 `src/a11y/lints/<lint>.ts`
- `src/a11y/lints/` 四张表：eslint、bun、oxlint、biome（均独立探测生成）

**完成判据**（全部实测通过）：

- 探针自检通过（已知必填 role 缺属性时 lint 确实报错）
- 三条不变量成立（`required ⊆ supported`、`requiredWhenFocusable ⊆ supported`、required-name role 的 `label`/`labelledby` 在 supported 里）
- 生成文件只含类型，`@meld-ts/core/a11y` 与 browser 包无 node 依赖
- 类型测试从 4 role 扩到代表集（switch / combobox / option / treeitem / separator / img / heading / slider / generic）

**移交项处置**（来自 Plan A 评审）：

- 空 idlist 数组的非元组缺口：运行时 `IDLIST_KEYS` 已随全量数据补齐 5 键（`0e7d9be` 既定「跳过」语义不变）；非元组（`string[]` 变量持有 `[]`）的类型层对齐未动，**转入 Plan C** 评估
- 任意两张表合并后的三条不变量断言：已扩到四表两两全部 6 对（`types.test.ts`，须逐对用具体类型别名断言）
- `A11yBuiltinLints` 键集合断言：已随四表更新为四键

**漂移检查**：lint 出新版、规则变了时，重跑 `bun run a11y:sync` 后 `git diff src/a11y/lints/` 会露出变化（设计 §7）。

---

## Plan C：CLI 与用户侧闭环（已完成）

**目标**：让使用方项目能按自己装的 lint 版本生成重载文件，并把 lint 一致性固化为可重复运行的测试。

**执行记录**：分支 `feat/a11y`，2026-11-22，SDD 流程（7 个任务，每任务独立实现 + 审查）。收官事实（bin 打包、用户模式输出、四层测试运行方式、AGENTS/CI、bun 两种 lint 模式）见设计稿 §12.12。

**交付物**（全部落地）：

- `src/bin/meld-ts.ts` + `bunup.bin.ts`：`meld-ts a11y probe [--lint=...] [--out=...] [--keep]`，打包到 `dist/bin/meld-ts.js`（shebang 由 banner 注入）
- 用户模式：读项目 package.json 发现的 lint，生成 `a11y-lints.generated.d.ts`（首行固定 `export {};`，写出后检查它在不在 tsconfig 的 include 里，不在只警告）
- 第 2 层一致性测试：`a11y()` 输出展开成字面属性，交给对应 lint 跑，要求零报错（`bun run test:a11y-lint`）
- 第 3 层反向测试：故意去必填属性，确认 lint 报错（同一脚本）
- 第 4 层构建产物重载测试：`build:dist` 后通过包名引用，验证重载生效/失效（`bun run test:a11y-build`）
- AGENTS 规则（禁止手写 `role=` / `aria-*`）+ CI grep 检查（按 rg 退出码分流）

**完成判据**（全部实测通过）：

- 四种模式（用户/维护者 × 生成/测试）按设计 §6 工作
- `bun run test:a11y-lint` 在 lab 里可重复运行
- 发版前检查包含构建产物重载测试（见下文「发版前检查（a11y）」）
- 决定 `bun run lint` 是否扩到 `./src` 之外：**已扩到 `./src ./test ./scripts` + `bunup.*.ts`**——`lint` / `fmt` 脚本均为 `biome ... ./src ./test ./scripts ./bunup.config.ts ./bunup.exports.ts ./bunup.browser.ts ./bunup.bin.ts`，`test/a11y` 的编译 fixture 进 CI 的 lint

**遗留**：

- ~~TS 7 验证~~：已完成。peer 改为 `>=5.9 <8`，CI `ts-matrix` 对 5.9.3 / 6.0.3 / 7.0.2 三档做类型检查（设计 §12.7）
- 空 idlist 非元组（`string[]` 变量持有 `[]`）的类型层对齐：未动，维持已知限制（设计 §12.5）；运行时语义已定（`IDLIST_KEYS` 把空数组丢键）

---

## 发版前检查（a11y）

CI（`pr-check.yml`）覆盖 lint / ts-check / build / AGENTS grep / test。a11y 的三层专项慢，不进 CI，发版前跑：

```bash
bun run test:a11y-lint    # §7 第 2/3 层：一致性 + 反向（lab，慢）
bun run test:a11y-build    # §7 第 4 层：构建产物重载
bun run a11y:sync && git diff src/a11y/lints/ src/a11y/aria.generated.ts src/a11y/probe/samples.generated.ts src/a11y/probe/profiles.generated.ts
                           # 漂移检查：lint 出新版/规则变了会露出 diff
```

已知 flake：bunup dist 构建（`build:dist`）在本机偶发 EINVAL（分支前既有，CI/ubuntu 未观察到）。`test:a11y-build` 对 build:dist 直接重试最多 3 次，仍失败才报错退出并打印 bunup 输出；本地挂了先重跑一次再排查。

TS 7 验证（设计 §12.7）已并入 CI 的 `ts-matrix` job，不再需要单独的手工检查。

另查 `dist/bin/meld-ts.js` 装好后可执行：npm / bun 安装会按 package.json 的 `bin` 字段设置可执行位；手动构建、不经安装的产物要自己 `chmod +x`。

---

## 进度核查方法

```bash
# 分支与已完成工作
git log --oneline main..feat/a11y

# 门禁
bun run fmt && bun run lint && bun run ts-check && bun run test

# a11y 数据漂移检查：重跑 sync（约 2–4 分钟），有 diff 说明 lint 出了新版/规则变了
bun run a11y:sync && git diff --stat src/a11y/lints/ src/a11y/aria.generated.ts src/a11y/probe/samples.generated.ts src/a11y/probe/profiles.generated.ts

# a11y 产物
ls src/a11y src/a11y/lints dist/a11y

# 计划与设计
ls docs/superpowers/plans docs/requirements docs/reviews
```

## 相关文档

- 设计稿：[a11y-design.md](./a11y-design.md)
- Plan A：[docs/superpowers/plans/2026-11-21-a11y-plan-a.md](../superpowers/plans/2026-11-21-a11y-plan-a.md)
- Plan A 审查记录：[docs/reviews/20261121-a11y-plan-a.md](../reviews/20261121-a11y-plan-a.md)
