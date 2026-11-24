# TypeScript 支持范围声明

- 日期：2026-11-24
- 状态：设计定稿，已实施（2026-11-24）
- 范围：仓库级（`package.json` 的 peer 声明、CI、README），不改运行时代码
- 关联：`docs/requirements/a11y-design.md` §12.2 / §12.7；`docs/requirements/a11y-roadmap.md`「发版前检查」

## 1. 问题

`peerDependencies.typescript` 写的是 `^7`，但仓库实际跑在 `5.9.3`，而文档工具链升不到 7。三者互斥：

| 层 | 事实 |
|----|------|
| 对消费者的声明 | `peerDependencies.typescript = "^7"`，要求装包的人用 TS 7 |
| 仓库实际执行 | `devDependencies.typescript = "5.9.3"`，`bun.lock` 也是 5.9.3；`bun run ts-check` 就是 `tsc --noEmit` |
| 文档工具 | `bun run doc` = `bun typedoc`；typedoc 0.28.20 依赖 TypeScript 编译器 API，TS 7 不提供 |

三条后果：

1. **用户被挡**。TS 5.x / 6.x 项目会收到 peer 警告；pnpm 开 `strict-peer-dependencies` 直接装不上。而库实际在 5.9.3 上是好的。
2. **验证项永远做不完**。roadmap 里挂着「等版本错位修好后在 `^7` 下复跑 ts-check」。但 devDep 必须留在 5.x/6.x 才能跑 typedoc，这条按原样无法完成。
3. **一升就炸**。真把 devDep 升到 7，`bun run doc` 立刻崩。

来源：`^7` 由 `17472c6`（2026-07-11）引入，那个 commit 的主题是「H1/H2/M1/M3 review bugs + CLAUDE.md sync」，与版本声明无关，也没有设计记录。

## 2. 证据（2026-11-24 实测）

| # | 检查 | 命令 | 结果 |
|---|------|------|------|
| 1 | 库在 TS 7 下能不能编译 | `bunx -p typescript@7.0.2 tsc -p tsconfig.json` | **exit 0**（含 `isolatedDeclarations`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`） |
| 2 | TS 7 有没有编译器 API | `node -e "const ts=require('typescript'); console.log(typeof ts.createProgram)"` | `undefined` |
| 3 | TS 7 的导出面 | `typescript@7.0.2` 的 `exports` | `.` → `./lib/version.cjs`（只有版本号）+ `./unstable/{sync,async,fs,proto,ast}` |
| 4 | typedoc 在 TS 7 下 | `bun node_modules/.bin/typedoc src/index.ts` | `TypeError: undefined is not an object (evaluating 'ts4.SyntaxKind.PropertyDeclaration')` |
| 5 | 同配置换 TS 6 | `bun add typescript@6.0.3` 后重跑 | `[info] html generated at ...` |
| 6 | typedoc 有没有新版本 | `npm view typedoc dist-tags` / `peerDependencies` | `latest = 0.28.20`，peer 上界仍是 `6.0.x` |
| 7 | 同类工具 | `npm view @microsoft/api-extractor dependencies.typescript` | `6.0.3`（写死依赖，不是 peer 范围） |
| 8 | Bun 有没有原生文档生成 | `bun --help`、`bun doc --help` | 子命令只有 `run/test/check/lint/fmt/x/repl/exec`，无 `doc` |
| 9 | `bun check` 能否替代 | `bun check --help` | 原生多核检查器，跟随 tsconfig 与 project references，但**不能指定 TypeScript 版本** |

## 3. 根因

文档与构建工具需要的不是「能编译」，而是**能读类型图**：符号表、类型解析、重载归属、声明合并。

TS 7 是 Go 原生实现，npm 包只暴露 AST 层 API（`unstable/ast` 等），没有类型检查器入口。因此所有依赖 TS 编译器 API 的工具——typedoc、api-extractor、ts-morph、`@typescript-eslint`——都被钉在 6.0.x 及以下。

这不是「某个工具还没适配」，而是 API 面不存在。短期内换工具不能解决，只能等待上游提供兼容层。

## 4. 概念区分

本设计的核心，是把一个字段承担的两个职责拆开：

| 概念 | 谁在看 | 本仓库取值 | 约束 |
|------|--------|-----------|------|
| **consumer support range** | 用户、包管理器 | `>=5.9 <8` | 必须是我们验证过的范围 |
| **toolchain version** | 构建、文档、CI | `5.9.3` | 必须是工具链支持的版本 |

两者不必相等。把它们混在一个 `devDependencies.typescript` 里，就会得到「声明要 7、实际跑 5、工具只支持到 6」这种自相矛盾的状态。

## 5. 决策

| 项 | 取值 | 理由 |
|----|------|------|
| `peerDependencies.typescript` | **整条删除**（连同 `peerDependenciesMeta`） | 本包发布 ESM + CJS，运行时不依赖 TypeScript，任何形式的 peer 声明都不该有 |
| 支持范围 | `>=5.9 <8`，只写在 README 与 `AGENTS.md`，不写进 `package.json` | 下界 = 唯一在本地验证过的低版本；上界排除 8 的 breaking。5.9 以下未实测，不声明。范围是文档承诺，由 CI `ts-matrix` 三档持续验证，不是包管理器约束 |
| `devDependencies.typescript` | 保持 `5.9.3` | typedoc 需要 JS API；最小改动，不重验 lockfile 与构建产物 |
| CI | 新增 `ts-matrix` job，三档 `5.9.3` / `6.0.3` / `7.0.2` | 下界、JS-bridge 最新、原生最新，各有证据 |
| 文档生成 | typedoc 不变，跑在 devDep 的 5.9.3 | 与 TS 7 支持互不影响 |

peer 彻底移除，而不是保留 optional：只要 peer 还在——哪怕标了 optional——npm / bun / pnpm 默认就会自动装入一个 TypeScript（2026-11 实测装入 `typescript@7.0.2` 这个 Go 原生包），纯 JS 消费者被迫承担；pnpm 严格模式下还会因缺 peer 安装失败。运行时不依赖 TypeScript，所以 `>=5.9 <8` 只作类型承诺：写在 README 与 `AGENTS.md`，由 CI 的 `ts-matrix` 持续验证；消费者版本越界不在安装阶段被拦，而是编译 `.d.ts` 时暴露。

不做 `^7`：会挡掉 5.x/6.x 用户，而 7 并非唯一可用版本。

不做「devDep 升 6.0.3」：能跑，但要重验构建与文档产物，收益仅是「本地跟到最新可支持版本」；6.0.3 已由 CI 一档覆盖。

## 6. CI 设计

在 `.github/workflows/pr-check.yml` 新增独立 job，不动现有 `check`：

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
        run: bunx -p typescript@${{ matrix.ts }} tsc -p tsconfig.json --noEmit
```

- `bunx -p` 临时拉指定版本，不写 lockfile、不改 `node_modules`，三档互不污染。
- `fail-fast: false`：三档都要报结果，别因为一档挂了看不到其余。
- **不引入 `bun check`**：它不能锁定 TS 版本，且换检查器会让诊断口径与本地 `ts-check` 不一致。矩阵的目的就是「同一检查器、不同版本」。
- 合并保护应要求 `ts-matrix-ok`（上面三个矩阵实例的聚合结果），不要直接要求 `ts-matrix (5.9.3)` 这类实例名——版本列表一变，实例名就变，required check 会失效。

`tsc -p tsconfig.json` 已包含 `src/a11y/types.test.ts` 里的类型断言（该文件在 `src/` 下，不在 `exclude` 里）。`test/a11y/*/tsconfig.json` 这些集成 fixture 由层 4 构建测试用 devDep 覆盖，不进矩阵。

## 7. 验证

| # | 验证 | 命令 | 期望 |
|---|------|------|------|
| 1 | 三档类型检查 | `bunx -p typescript@5.9.3 tsc -p tsconfig.json --noEmit`（6.0.3、7.0.2 同理） | 三条都 exit 0 |
| 2 | 无 peer、安装期无版本门 | 打包后检查 tarball 的 `package.json` 不含 `peerDependencies`；在无 TypeScript 的 scratch 项目里 `npm i <tarball>` 与 pnpm（`strict-peer-dependencies=true`、`auto-install-peers=false`）都成功，且 `node_modules` 里没有 `typescript`；`npm i --strict-peer-deps <tarball> typescript@5.8.3` 也成功 | 四条都成立 |
| 3 | 现有测试 | `bun run test` | 628 pass / 49 skip / 0 fail，与改动前一致 |
| 4 | 构建 | `bun run build` | 成功；产物不变 |
| 5 | 文档不受影响 | `bun run doc` | 正常生成 HTML |

第 2 项对应最终决策：peer 整条删除，所以安装阶段不存在版本门——范围内、范围外、甚至不装 TypeScript 都能安装成功；纯 JS 消费者不会被带入任何 TypeScript 版本。类型兼容由第 1 项的三档类型检查保证。

## 8. 风险

| 风险 | 处置 |
|------|------|
| 6.0.3 档冒出 5.9.3 下看不到的错误 | 视为真实问题，在类型层修复；不通过缩窄声明来绕过 |
| `>=5.9 <8` 允许未来的 7.1+ 未经逐版本测试 | CI 固定跑 7.0.2；7.1 等新的 minor 发布后，把它加入（或替换）矩阵第三档再验证 |
| `bunx -p` 在 CI 每次下载 TS 二进制 | `setup-bun` 的全局缓存可复用；三档合计数十秒 |
| 放宽 peer 会不会让用户装到坏版本 | 是**放宽**不是收紧，最坏情况等于现状；且 7.0.2 已实测通过 |
| 某天 typedoc 支持 TS 7，是否还要升 devDep | 独立决策，不在本设计；届时 CI 已提供证据 |

## 9. 交付物

| 文件 | 改动 |
|------|------|
| `docs/superpowers/specs/2026-11-24-ts-version-range-design.md` | 本设计 |
| `package.json` | 删除 `peerDependencies.typescript` 与 `peerDependenciesMeta`（原为 `^7`），支持范围只写文档 |
| `.github/workflows/pr-check.yml` | 新增 `ts-matrix` job |
| `README.md` | 写明支持范围，以及「文档工具链为何留在 5.9/6.0」 |
| `docs/requirements/a11y-design.md` | §12.7 标注该限制已解除 |
| `docs/requirements/a11y-roadmap.md` | 「发版前检查」里的 TS 7 待办改为已完成 |

## 10. 非目标

- 不评估或替换 typedoc（已决定留在 5.9/6.0）
- 不引入 deno、esbuild 或其他解析器/打包器
- 不把 devDep 升到 7
- 不改任何运行时代码、不改 a11y 的类型表
- 不为「未来 Bun 原生文档生成」预留任何结构
