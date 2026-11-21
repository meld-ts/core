# @meld-ts/core/a11y 整体进度

> 设计依据：[a11y-design.md](./a11y-design.md)。
> 按子系统拆成三份计划，每份独立可交付、独立验收。

## 总览

| 计划 | 内容 | 状态 | 交付物 |
|---|---|---|---|
| **A** 类型核心与运行时 | 类型机器 + `createA11y` 运行时 + 手写缩小版数据 | ✅ 已完成（2026-11-21） | `src/a11y/` 全部、子路径 `@meld-ts/core/a11y` |
| **B** 探针与全量数据 | 探针 + `a11y:sync`，从真实 lint 生成全量规则表 | ⬜ 未开始 | `probe/`、`aria.generated.ts` 全量、`lints/` 四张表 |
| **C** CLI 与用户侧闭环 | `meld a11y probe`、用户模式重载、一致性/反向/产物测试 | ⬜ 未开始 | `src/bin/meld.ts`、一致性测试、AGENTS 规则 |

依赖关系：B 依赖 A 的类型契约（`A11yProfile` 字面量形状）；C 依赖 A + B。

---

## Plan A：类型核心与运行时（已完成）

**目标**：按 lint 规则表在类型层约束 aria 属性输入、精确推断输出；只经 exports 子路径提供 `createA11y`，不导出默认实例。

**执行记录**：分支 `feat/a11y`，2026-11-21，SDD 流程（每任务独立实现 + 审查），共 10 个 commit。

| Task | 内容 | 状态 |
|---|---|---|
| 1 | 数据层类型（手写缩小版：4 role × biome/oxlint） | ✅ |
| 2 | 注册表与重载检查（`A11yLintOverrides`、`OverrideKeyCheck`、3 个 tsc fixture） | ✅ |
| 3 | 输入输出类型、多 lint 合并、选项解析 | ✅ |
| 4 | `createA11y` 运行时实现 + 单测 | ✅ |
| 5 | 接线（bunup / browser / exports / README / CLAUDE.md） | ✅ |
| 6 | 全量验证（fmt / lint / ts-check / test） | ✅ |

**验收方式**：

```bash
bun run ts-check   # 类型断言（含 @ts-expect-error）全部生效
bun run lint       # 0 warning
bun run test       # 448 pass / 26 skip / 0 fail；src/a11y 覆盖率 100%（round 4 复审后实测计数）
ls dist/a11y       # esm/cjs/d.ts/d.cts 四产物
grep -A4 '"./a11y"' package.json
```

**说明**：本计划的数据是**手写缩小版**（biome 2.6.8 / oxlint 1.94.0，仅 switch / img / separator / combobox 四个 role），不是全量数据。文件头已注明会被 Plan B 整文件覆盖。

**终审**：无 Critical；3 条 Important（typedoc 入口、`skills/meld-ts-core/SKILL.md`、`docs/reviews/` 记录）已修复并复审通过。

**计划文档**：[2026-11-21-a11y-plan-a.md](../superpowers/plans/2026-11-21-a11y-plan-a.md)

---

## Plan B：探针与全量数据（未开始）

**目标**：用探针从真实 lint 生成全量规则表，替换 Plan A 的手写缩小版。核心理由见设计 §2：规则表只能从 lint 本身实测，不能凭规范手写。

**交付物**：

- `src/a11y/aria.generated.ts`：全量（aria-query 127 个 role、全部 ARIA 属性、名字规则、idlist/id 分类）
- `src/a11y/probe/samples.generated.ts`：每个属性的合法样例值
- `src/a11y/probe/`：detect（发现项目里的 lint 与版本）、fixtures、exec（可注入子进程）、runners（四个 lint）、serialize
- `scripts/a11y-sync.ts`：维护者模式，建 lab、装最新 lint、跑探针、覆盖写 `src/a11y/lints/<lint>.ts`
- `src/a11y/lints/` 四张表：eslint、bun（第一版 `aliasOf: 'eslint'`）、oxlint、biome

**完成判据**：

- 探针自检通过（已知必填 role 缺属性时 lint 确实报错）
- 三条不变量成立（`required ⊆ supported`、`requiredWhenFocusable ⊆ supported`、required-name role 的 `label`/`labelledBy` 在 supported 里）
- 生成文件只含类型，`@meld-ts/core/a11y` 与 browser 包无 node 依赖
- 类型测试从 4 role 扩到代表集（switch / combobox / option / treeitem / separator / img / heading / slider / generic）

**必须吸收的移交项**（来自 Plan A 评审）：

- 空 idlist 数组的非元组缺口：`string[]` 变量持有 `[]` 时，类型层仍承诺输出键、运行时却跳过（0e7d9be 已定「跳过」语义并记录在 `types.ts` / `createA11y.ts` 注释；非元组的类型层对齐留待全量数据落地时评估）
- 任意两张表合并后的三条不变量形式化断言（biome+oxlint 已进 `types.test.ts`，Plan B 补 eslint / bun 表后扩到全部表对）
- `A11yBuiltinLints` 键集合断言随表数量同步更新

---

## Plan C：CLI 与用户侧闭环（未开始）

**目标**：让使用方项目能按自己装的 lint 版本生成重载文件，并把 lint 一致性固化为可重复运行的测试。

**交付物**：

- `src/bin/meld.ts` + `bunup.bin.ts`：`meld a11y probe [--lint ...] [--out ...] [--keep]`
- 用户模式：读项目 package.json 发现的 lint，生成 `a11y-lints.generated.d.ts`（首行固定 `export {};`）
- 第 2 层一致性测试：`a11y()` 输出展开成字面属性，交给对应 lint 跑，要求零报错
- 第 3 层反向测试：故意去必填属性，确认 lint 报错
- 第 4 层构建产物重载测试：`build:dist` 后通过包名引用，验证重载生效/失效
- AGENTS 规则（禁止手写 `role=` / `aria-*`）+ CI grep 检查

**完成判据**：

- 四种模式（用户/维护者 × 生成/测试）按设计 §6 工作
- `bun run test:a11y-lint` 在 lab 里可重复运行
- 发版前检查包含构建产物重载测试

---

## 进度核查方法

```bash
# 分支与已完成工作
git log --oneline main..feat/a11y

# 门禁
bun run fmt && bun run lint && bun run ts-check && bun run test

# a11y 产物
ls src/a11y src/a11y/lints dist/a11y

# 计划与设计
ls docs/superpowers/plans docs/requirements docs/reviews
```

## 相关文档

- 设计稿：[a11y-design.md](./a11y-design.md)
- Plan A：[docs/superpowers/plans/2026-11-21-a11y-plan-a.md](../superpowers/plans/2026-11-21-a11y-plan-a.md)
- Plan A 审查记录：[docs/reviews/20261121-a11y-plan-a.md](../reviews/20261121-a11y-plan-a.md)
