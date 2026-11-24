# TypeScript 支持范围实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `peerDependencies.typescript` 从 `^7` 改成实测过的 `>=5.9 <8`，并用 CI 三档类型检查持续证明这条声明。

**Architecture:** 把「消费者支持范围」与「工具链版本」拆成两个独立事实：peer 声明支持范围，`devDependencies` 继续钉 5.9.3 供 typedoc 使用，CI 用 `bunx -p typescript@<v> tsc` 分别验证 5.9.3 / 6.0.3 / 7.0.2。不引入新运行时或新工具。

**Tech Stack:** Bun 1.4.x、TypeScript 5.9.3（devDep）、GitHub Actions、npm（仅用于消费者 peer 验证）。

**Spec:** `docs/superpowers/specs/2026-11-24-ts-version-range-design.md`

## Global Constraints

- 只用 bun；不引入 deno、esbuild 或其他解析器/打包器。
- `peerDependencies.typescript` 必须是 `>=5.9 <8`；`devDependencies.typescript` 保持 `5.9.3`。
- 不改任何运行时代码（`src/**` 的逻辑与类型表都不动）。
- 不替换 typedoc，不升级 devDep 的 TypeScript。
- 代码风格：Biome，单引号、分号、2 空格、80 列。
- 提交信息用 conventional commits，小写、带 scope。
- 不要 stage `.lefthook/pre-push/check.sh`（lefthook 的权限位副作用）。

---

### Task 1: peer 范围与消费端安装验证

**Files:**
- Modify: `package.json:151`（`peerDependencies` 段里的 `typescript` 一行）
- Modify: `bun.lock`（由 `bun install` 自动更新，只应变动 peer 那一行）

**Interfaces:**
- Consumes: 无
- Produces: `package.json` 的 `peerDependencies.typescript = ">=5.9 <8"`；后续任务依赖这个值

- [ ] **Step 1: 复现现状失败（RED）**

在仓库根目录执行，确认 TS 5.9.3 消费者当前装不上：

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
bun pm pack
rm -rf /tmp/peer-check && mkdir -p /tmp/peer-check && cd /tmp/peer-check
npm init -y >/dev/null 2>&1
npm i --strict-peer-deps /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y/meld-ts-core-1.0.2.tgz typescript@5.9.3 > /tmp/peer-red.log 2>&1
echo "exit=$?"
tail -6 /tmp/peer-red.log
```

Expected: `exit=1`，日志包含 `npm error ERESOLVE` 与 `Fix the upstream dependency conflict`。

- [ ] **Step 2: 改 peer 范围**

把 `package.json` 中的：

```json
  "peerDependencies": {
    "typescript": "^7"
  }
```

改成：

```json
  "peerDependencies": {
    "typescript": ">=5.9 <8"
  }
```

- [ ] **Step 3: 更新 lockfile**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
bun install
git diff bun.lock
bun install --frozen-lockfile
```

Expected: `bun.lock` 里根包的 peer 那一行由 `"typescript": "^7"` 变为 `"typescript": ">=5.9 <8"`，没有其他改动；`bun install --frozen-lockfile` 成功（证明 CI 用同一条命令不会因 lockfile 落后而失败）。

- [ ] **Step 4: 验证 5.9.3 可以安装（GREEN）**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y && bun pm pack
rm -rf /tmp/peer-check && mkdir -p /tmp/peer-check && cd /tmp/peer-check
npm init -y >/dev/null 2>&1
npm i --strict-peer-deps /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y/meld-ts-core-1.0.2.tgz typescript@5.9.3 > /tmp/peer-green.log 2>&1
echo "exit=$?"
tail -3 /tmp/peer-green.log
```

Expected: `exit=0`，日志里没有 `ERESOLVE`。

- [ ] **Step 5: 验证 6.0.3 与 7.0.2 也可以安装**

```bash
for v in 6.0.3 7.0.2; do
  rm -rf /tmp/peer-check && mkdir -p /tmp/peer-check && cd /tmp/peer-check
  npm init -y >/dev/null 2>&1
  npm i --strict-peer-deps /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y/meld-ts-core-1.0.2.tgz typescript@$v > /tmp/peer-$v.log 2>&1
  echo "typescript@$v exit=$?"
done
```

Expected: 两行都是 `exit=0`。

- [ ] **Step 6: 跑现有测试，确认没有行为变化**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
bun run test 2>&1 | grep -E "^\s*[0-9]+ (pass|fail|skip)"
```

Expected: `628 pass`、`49 skip`、`0 fail`。

- [ ] **Step 7: 清理临时产物并提交**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
rm -f meld-ts-core-1.0.2.tgz
rm -rf /tmp/peer-check
git add package.json bun.lock
git commit -m "fix(ts): declare the tested TypeScript support range"
```

---

### Task 2: CI 三档类型检查

**Files:**
- Modify: `.github/workflows/pr-check.yml`（在现有 `check` job 之后追加）

**Interfaces:**
- Consumes: Task 1 的 `peerDependencies.typescript` 取值；两者必须一致（`5.9.3` / `6.0.3` / `7.0.2` 都落在 `>=5.9 <8` 内）
- Produces: CI job 名 `ts-matrix`，三档 `strategy.matrix.ts`

- [ ] **Step 1: 先确认三档在本地能跑通**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
for v in 5.9.3 6.0.3 7.0.2; do
  bunx -p typescript@$v tsc -p tsconfig.json > /tmp/tsc-$v.log 2>&1
  echo "typescript@$v exit=$?"
done
```

Expected: 三行都是 `exit=0`。若某档失败，这是真实缺陷：先读 `/tmp/tsc-<v>.log`，在类型层修，不通过缩窄 peer 绕开。

- [ ] **Step 2: 追加 job**

在 `.github/workflows/pr-check.yml` 文件末尾（现有 `check` job 的 `Test` step 之后）追加：

```yaml

  ts-matrix:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        ts: ['5.9.3', '6.0.3', '7.0.2']

    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - uses: oven-sh/setup-bun@v2

      - name: Install
        run: bun install --frozen-lockfile

      - name: Type check with TypeScript ${{ matrix.ts }}
        run: bunx -p typescript@${{ matrix.ts }} tsc -p tsconfig.json
```

- [ ] **Step 3: 校验 YAML 语法**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/pr-check.yml')); print(sorted(d['jobs']))"
```

Expected: 打印 `['check', 'ts-matrix']`。

- [ ] **Step 4: 确认现有 job 没被动过**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
git diff .github/workflows/pr-check.yml | grep -E '^-' | grep -v '^---'
```

Expected: 无输出（只有新增行，没有删除或修改行）。

- [ ] **Step 5: 提交**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
git add .github/workflows/pr-check.yml
git commit -m "ci(ts): type-check against the declared TypeScript range"
```

---

### Task 3: 文档与记录同步

**Files:**
- Modify: `README.md`（在「开发」代码块之后新增一节）
- Modify: `docs/requirements/a11y-design.md:643-645`（§12.7 标注已解决）
- Modify: `docs/requirements/a11y-roadmap.md:108` 与 `:126`

**Interfaces:**
- Consumes: Task 1 的 peer 值、Task 2 的 job 名 `ts-matrix`
- Produces: 无代码接口；文档必须与 `package.json` 和 CI 的实际内容一致

- [ ] **Step 1: README 增加「TypeScript 版本」一节**

在 `## 开发` 的代码块结束之后（即 `bun run doc           # 生成 TypeDoc API 文档` 那一行下面的 ``` 之后）、`## 构建说明` 之前，插入：

```markdown
## TypeScript 版本

- **支持的消费者版本**：`>=5.9 <8`（见 `peerDependencies`）。CI 用 5.9.3 / 6.0.3 / 7.0.2 三档分别做类型检查。
- **仓库工具链版本**：固定在 `5.9.3`。`bun run doc` 使用的 typedoc 依赖 TypeScript 的编译器 API，而 TS 7 只提供 AST 层 API（`unstable/ast`），因此文档工具链不能升到 7。

两者是不同的东西：前者是给使用者的版本承诺，后者是构建和文档工具需要的版本。
```

- [ ] **Step 2: 设计稿 §12.7 标注已解决**

把 `docs/requirements/a11y-design.md` 中 §12.7 的那一段（以「§7 第 1 层要求类型测试在 core 声明的 TypeScript 版本」开头的正文）末尾追加上：

```markdown

**已于 2026-11-24 解决。** peer 声明改为 `>=5.9 <8`，`devDependencies` 保持 5.9.3，CI 新增 `ts-matrix` 对 5.9.3 / 6.0.3 / 7.0.2 三档做类型检查。7.0.2 下 `tsc -p tsconfig.json` 实测 exit 0。详见 [spec](../superpowers/specs/2026-11-24-ts-version-range-design.md)。
```

- [ ] **Step 3: roadmap 关掉两处待办**

把 `docs/requirements/a11y-roadmap.md:108` 的整行：

```markdown
- TS 7 验证：等 lockfile / peer 的 TypeScript 版本错位修复（devDependencies 锁 5.9.3，peer 声明 `^7`）后，在 `^7` 下复跑一次 `ts-check`（设计 §12.7）
```

替换为：

```markdown
- ~~TS 7 验证~~：已完成。peer 改为 `>=5.9 <8`，CI `ts-matrix` 对 5.9.3 / 6.0.3 / 7.0.2 三档做类型检查（设计 §12.7）
```

把 `docs/requirements/a11y-roadmap.md:126` 的整行：

```markdown
TS 7 验证（设计 §12.7）等版本错位修复后并入这里。
```

替换为：

```markdown
TS 7 验证（设计 §12.7）已并入 CI 的 `ts-matrix` job，不再需要单独的手工检查。
```

- [ ] **Step 4: 检查没有残留的旧说法**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
rg -n 'peer 声明 `\^7`|等版本错位修复|peer 声明是 `\^7`' docs README.md
```

Expected: 无输出。

- [ ] **Step 5: 提交**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
git add README.md docs/requirements/a11y-design.md docs/requirements/a11y-roadmap.md
git commit -m "docs(ts): record the TypeScript support range and toolchain split"
```

---

### Task 4: 全量验收

**Files:** 无改动（只验证）

**Interfaces:**
- Consumes: Task 1–3 的全部产出
- Produces: 合并前的证据

- [ ] **Step 1: 静态门禁**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
bun run fmt
bun run lint
bun run ts-check
```

Expected: fmt 无改动；lint 无 error；ts-check 无输出。

- [ ] **Step 2: 三档类型检查**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
for v in 5.9.3 6.0.3 7.0.2; do
  bunx -p typescript@$v tsc -p tsconfig.json > /tmp/final-tsc-$v.log 2>&1
  echo "typescript@$v exit=$?"
done
```

Expected: 三行都是 `exit=0`。

- [ ] **Step 3: 测试与构建**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
bun run test 2>&1 | grep -E "^\s*[0-9]+ (pass|fail|skip)"
rm -rf dist && bun run build
```

Expected: `628 pass` / `49 skip` / `0 fail`；build 成功。（若 `build:dist` 报 `EINVAL`，先 `rm -rf dist` 再重跑一次——这是已记录的 bunup 本机 flake。）

- [ ] **Step 4: 文档生成不受影响**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
bun run doc 2>&1 | tail -3
```

Expected: 正常结束，无 `SyntaxKind` 之类的 TypeError。

- [ ] **Step 5: 确认工作区只剩预期的未提交项**

```bash
cd /Users/jiankzeng/.local/share/opencode/worktree/070f77/a11y
git status --short
```

Expected: 只有 `M .lefthook/pre-push/check.sh`（不得提交）与构建产物（若被 gitignore，则不出现）。
