# argus · src 全量代码审查（1.0.3）

> argus 多 agent 审查：4 reviewer + 3 auditor + 1 integrator + 1 fixer
> 2026 年 11 月 25 日

## 范围

对 `main`（`73c300c chore: bump version to 1.0.3`）的整个 `src/` 做一次全量审查。

起点取初始提交 `fb7d044`——与 `main` 同点的 base 会让 diff 为空，取初始提交才能覆盖全部源码。

```
105 文件 / 42,710 增 / 482 删
其中 28,197 行是生成的 a11y 表（profiles / lints / aria）
手写代码约 15,300 行（含测试）
```

## 方法

| 角色 | 模型 | 人数 |
|---|---|---|
| reviewer | grok-4.6 / GLM-5.3 / DeepSeek-V4.1 / grok-4.5 | 4 |
| auditor | GLM-5.3 / grok-4.6 / DeepSeek-V4.1 | 3 |
| integrator | GLM-5.3 | 1 |
| fixer | GLM-5.3 | 1 |
| preflight | DeepSeek-V4.1 | 1 |

每轮流程：preflight（lint / ts-check / test）→ reviewer 并行独立找问题 → integrator 合并去重 → 3 个 auditor 各自独立投「修 / 不修 / 要用户定」→ 多数票 → fixer 修 → 提交。改动有分歧的（改法会动流程或设计）交给维护者拍板。

## 结果

```
Round 1: 12 条 → 修 9 + 用户定 2 + 不修 1
Round 2:  4 条 → 修 3 + 记录 1
Round 3:  2 条 → 修 1 + 记录 1
Round 4:  0 条 → clean（4 个 reviewer 全 0）
```

各轮共 30 条原始 finding，整合去重后 18 条；共修 15 条，3 个 fix commit。

## 修了什么

### 运行时行为（3 个 Important）

| 位置 | 问题 |
|---|---|
| `src/timer.ts` | `createTimer` 对象配置里的 `mode` 被静默忽略，`interval` 退化成 `timeout`——定时器语义完全错 |
| `src/events/index.ts` | `off(name, callback)` 不清理 `once` 标记，重新订阅的同一函数会意外只触发一次 |
| `src/async/retry.ts` | `timeout()` 里 fn 同步抛错不会变成 Promise rejection，调用方拿不到 Promise |

### 并发语义（第 2、3 轮新发现）

- 并发 `emit` 时 `once` 回调会触发多次——修法是把「摘除 once」提到跑回调之前
- `pending()` 同步重入时 inflight 去重失效，`fn` 会跑多次
- `once` 回调在触发期间重入 `on()` 注册自己，被 emit 的 once 清理误删

### 探针与 CLI

- `detectLints` 对没有 `package.json` 的目录抛裸 ENOENT → 改成可读警告
- CLI 用 `JSON.parse` 读 `tsconfig.json`，带注释的常见配置被误报「读不了」→ 容忍 JSONC

### 文档与发版

- `skills/meld-ts-core/SKILL.md` 还写未发布的 `meld` 命令 → `meld-ts`
- README 的 100% 覆盖率徽章与实测不符（当时实测 99.75%，`src/timer.ts` 与 `src/traits/debuggable.ts` 有未覆盖行），且 `bunfig.toml` 没设阈值——往下掉不会有任何检查报错。修法是补齐测试 + `coverageThreshold = 1`，现在真的 100% 且有门禁
- `lefthook.yml` 的 `git add -u src/` 与 fmt 的目标范围不一致
- `version-bump.yml` 补上 `test:a11y-build`——roadmap 要求的发版前检查，之前一项都没跑
- 合并前草稿挪到 `docs/reviews/20261121-a11y-design-pre-merge-draft.md`，`docs/requirements/` 只留权威设计稿

## 判了不修

- **`cloneObject` 遇不可 clone 值直接抛**（`src/base/cloneObject.ts`）
  JSDoc 只承诺「structuredClone 不可用时降级到 JSON」，对函数等不可 clone 值 fail-fast 是它的语义。改成静默降级会把函数字段悄悄丢掉。三个 auditor 一致。

- **`once` 在 emit 期间以 `once` 重新注册自己仍被清理**（第 2 轮 F-03）
  与已修的那条是同一机制的不同触发路径，当时的判断是再改会搅乱「触发前摘除」的修复。
  事后实测：第 2 轮把摘除提到触发前之后，这个场景已经正常了（见下）。

## 遗留 Minor（已补）

审查结束时留了两条 Minor，维护者要求一并处理，已在本文件的同一个 PR 里补掉。

### 1. `once` 的摘除时机与文档不一致

实现是「触发前摘除」，文档还写「触发后」。三处已改：

- `AGENTS.md:185`：`once 回调在触发前就摘除，成功失败都只触发一次`
- `src/events/index.ts:71`：`首次触发时先摘除、再执行回调`
- `src/events/index.ts:182`：`on(name, cb, true)` 等同于 `once()`——触发时先摘除、再执行回调

### 2. 新语义没有测试钉住

原有测试已覆盖「并发 emit 只触发一次」和「回调里用 `on` 重注册」，缺的是「用 `once` 重注册」与「摘除先于执行」。新增两条：

```ts
// once 回调在触发期间用 once 重新注册自己 → 3 次 emit 触发 3 次
test('re-once during emit survives the cleanup and fires again later')

// 回调内重入 emit，内层快照里没有自己 → 只触发 1 次
test('re-entrant emit inside the callback does not fire it again')
```

验证这两条真的钉住了语义：把摘除挪回 `Promise.all` 之后（故障注入），`src/events` 有 3 条测试转红——包括新增的两条；恢复后 44 条全过。

## 维护者决策

| 编号 | 决策 | 落地 |
|---|---|---|
| F-04 | 选项 1：workflow 里补检查 | `version-bump.yml` 加 `test:a11y-build`；roadmap / AGENTS / README 同步 |
| F-06 | 选项 2：旧稿移出 `docs/requirements/` | 挪到 `docs/reviews/20261121-a11y-design-pre-merge-draft.md`，现行设计稿加指向 |

## 验证

```
bun run test      645 pass / 49 skip / 0 fail（基线 628，新增 17 个测试）
bun run lint      Checked 118 files, no fixes applied
bun run ts-check  clean
```

每轮修复后 preflight 都重跑过这三项，第 4 轮仍 pass。

## 提交

```
f58579b  round01: fix F-01…F-11
52995fe  round02: fix F-01 F-02 F-04
cb188c5  round03: fix F-01
```

合入工作分支时用打扁合并，得到一个提交 `c55369c fix: address argus review findings on src`。

## 附：保留的审查过程记录

```
/Users/jiankzeng/Documents/argus-reviews/fix-meld-ts-1.0.3-check/
  src-103-task.json           任务与各轮状态
  src-103/round01..04/
    preflight.md              lint / ts-check / test 结果
    review_r1..r4.md          各 reviewer 的原始 finding
    _review_findings.md       整合后的 finding
    _review_findings_audited.md  审计与多数票结果
    audit_a1..a3.md           各 auditor 的投票
    fix_report.md             fixer 的修复报告
```
