# bin 与 a11y probe 迁出 src

- 日期:2026-11-28
- 状态:设计初稿,待用户过目
- 范围:前置修复 `lint/fixtures/` 夹具;`src/bin/` → `bin/`,`src/a11y/probe/` → `bin/a11y-probe/`;4 个 scripts(a11y-sync、a11y-build-test、a11y-lint-test、lab)的 import 与 2 处硬编码生成路径;biome / bunfig / package.json / lefthook / tsdown.bin / pr-check 配置;AGENTS.md 与 a11y 文档的路径引用
- 目标:`bin/` 与 `src/` 同级,不再受 src 的 100% 测试覆盖率与 doc:check JSDoc 门禁约束;src 的 node: 模块禁令例外随之消失,规则变纯净
- 关联:AGENTS.md「代码规范 3」「测试 5」「a11y」「搬文件、改名」;`docs/a11y.md`、`docs/requirements/a11y-design.md`、`a11y-roadmap.md`
- 前置:JSDoc 补全任务已完成(7 commits,`f62b472..6b0c445`)

## 1. 背景

`src/bin/`(CLI 入口 meld-ts)与 `src/a11y/probe/`(探针,25 文件、约 18k 行,大头是 14k 行的生成数据)是 Node 侧的内部工具,和「同一份源码打包给浏览器」的 src 主体定位不同:

- AGENTS.md 为它们开了例外:src 禁 `node:` 模块的两条例外、覆盖率条款「bin 按需测试」;
- probe 的 12 个测试文件目前参与 `bun run test src/` 的 100% 覆盖率门槛,维持成本高;
- JSDoc 补全任务已证明 doc:check 只看入口链(bin/probe 不在 typedoc entryPoints,本就不受 JSDoc 约束)。

迁出后:例外条款删除、规则变纯净,bin 按内部工具的标准维护。

## 2. 目标结构

```
bin/                        # 与 src/ 同级,Node 内部工具,可用 node: 模块
├── meld-ts.ts              # CLI 入口(原 src/bin/meld-ts.ts)
├── meld-ts.test.ts
└── a11y-probe/             # 探针(原 src/a11y/probe/,内部结构原样)
    ├── index.ts / probe.ts / detect.ts / ...
    ├── runners/
    └── *.generated.ts      # profiles.generated.ts / samples.generated.ts
```

前后对照:

| 改动前 | 改动后 |
|--------|--------|
| `src/bin/meld-ts.ts` + `.test.ts` | `bin/meld-ts.ts` + `.test.ts` |
| `src/a11y/probe/`(全部 25 文件) | `bin/a11y-probe/`(目录内容原样,不改名) |

`dist/bin/meld-ts.js` 产物路径与 `package.json` 的 `bin` 字段**不变**(tsdown outDir 固定 `./dist/bin`)。

## 3. 依赖事实(2026-11-28 侦察)

- probe 内部自包含:`runners/*` 的 `../fixtures`、`../exec` 均为 probe 目录内相对引用,无跨出目录的 import;
- `src/bin/meld-ts.ts` 只依赖 probe(12 处 import),不依赖 src 其他模块;
- 外部引用 probe 的有 4 个文件:`scripts/a11y-sync.ts`、`scripts/a11y-build-test.ts`、`scripts/a11y-lint-test.ts`(probe、ProbeRunner、consistency、detect,5 处)、`scripts/lab.ts`;
- `src/a11y/` 公开模块不 import probe;`src/browser/` 不引用;typedoc entryPoints 不含;
- probe 与 bin 可用 `node:` 模块(exec/probe/tsconfig-check 等),迁出后不再需要 biome 的 noNodejsModules 例外。

## 4. 改动清单

### 4.1 前置修复:lint/fixtures 夹具恢复

`577c826` 提交把 `lint/fixtures/` 的 28 个夹具文件格式化重排(import 排序、双引号、`export default` 去括号),`noExportedImports` 诊断数随之变化,`lint/no-cross-file-reexport.test.ts` 4 个用例失败(夹具注释明写「不要『修复』本文件」)。

修复:`git checkout 593f6d6 -- lint/fixtures/` 恢复夹具原形态(已试跑验证:12/12 全绿),单独 commit。这是恢复被误改的形态,不是「修复」夹具。此修复让 `bun run test` 全绿基线成立,本设计所有验证标准不再携带「除预存失败外」的口径。

### 4.2 文件搬移

1. `git mv src/bin/meld-ts.ts bin/meld-ts.ts`、`git mv src/bin/meld-ts.test.ts bin/meld-ts.test.ts`
2. `git mv src/a11y/probe bin/a11y-probe`(目录整体,含 runners/ 与生成文件)

依 AGENTS.md「搬文件、改名」:不留转发,搬完 `rg 'src/bin|a11y/probe'` 全仓搜旧路径。

### 4.3 import 更新

| 文件 | 改动 |
|------|------|
| `bin/meld-ts.ts` | `../a11y/probe` → `./a11y-probe`(12 处) |
| `bin/meld-ts.test.ts` | `../a11y/probe` → `./a11y-probe` |
| `scripts/a11y-sync.ts` | `../src/a11y/probe` → `../bin/a11y-probe`(约 20 处 import);另 2 处硬编码生成路径:`rel: 'src/a11y/probe/samples.generated.ts'` 与 `'src/a11y/probe/profiles.generated.ts'` → `bin/a11y-probe/...` |
| `scripts/a11y-build-test.ts` | 同上(4 处) |
| `scripts/a11y-lint-test.ts` | 同上(5 处:probe、ProbeRunner、consistency、detect) |
| `scripts/lab.ts` | 同上(1 处) |

### 4.4 配置

| 文件 | 改动 |
|------|------|
| `tsdown.bin.ts` | `entry: ['src/bin/meld-ts.ts']` → `['bin/meld-ts.ts']` |
| `biome.json` | `files.includes` 增加 `"bin/**/*.{ts,js}"`(lint 与 fmt 均覆盖,与 scripts/ 同等待遇;生成文件随目录迁移,待遇不变);noNodejsModules 的 override 从 `["src/**", "!src/bin/**", "!src/a11y/probe/**", "!**/*.test.ts"]` 简化为 `["src/**", "!**/*.test.ts"]`(例外消失) |
| `bunfig.toml` | 删除 `coveragePathIgnorePatterns = ["src/bin/**"]`(bin 不再在 src/ 测试路径下) |
| `package.json` | 新增 `"test:bin": "bun test bin/"`(不带 `--coverage`——bunfig 的 100% 门槛对所有带 `--coverage` 的 bun test 生效,bin 不受此约束);`fmt:all` 与 `lint` 脚本的目标加 `./bin` |
| `.github/workflows/pr-check.yml` | `Test` 步骤后新增一步 `bun run test:bin`(bin 的 12 个测试文件移出 `bun run test` 路径后,不经 CI 就再无人跑;meld-ts CLI 随 npm 包发布,测试写了就要跑) |
| `lefthook.yml` | pre-commit 的 `git add -u` 范围加 `bin/` |
| `tsconfig.json` | 不改(无 include,默认全仓,ts-check 继续管 bin 的类型;scripts/ 的断链也会被 ts-check 报出) |

### 4.5 测试与 a11y:sync 验证

- `bun run test`(`bun test src/ lint/ --coverage`)自动不再跑 bin 的 12 个测试文件——src 覆盖率统计缩小到 src 实际公开面,100% 门槛不动;
- probe 的测试文件随目录搬走,保留、经 `test:bin` 与 CI 运行;
- `bun run a11y:sync` 完整跑一次,验证生成文件写入 `bin/a11y-probe/`。跑完的处理:**表内容 diff(lint 新版本导致的数据变化)先 `git checkout` 还原,数据更新以后单独提交,不与搬目录混在一个 diff 里**;还原后跑 `bun run test:a11y-lint`(按表头版本精确安装,验证的是提交进仓库的那几个版本)。

### 4.6 文档同步

- `docs/a11y.md`、`docs/requirements/a11y-design.md`、`docs/requirements/a11y-roadmap.md`:更新 `src/a11y/probe` 路径引用为 `bin/a11y-probe`;
- AGENTS.md 建议见 §7。

## 5. 验证标准

1. `rg -n 'src/bin|a11y/probe' --glob '!docs/superpowers/**' --glob '!node_modules' --glob '!dist'` → 0 处旧路径残留(含生成文件头注释与文档);
2. `bun run test` → **全绿**(前置修复后无已知失败),覆盖率 100% 不降;
3. `bun run test:bin` → bin 的 12 个测试文件全绿;
4. `bun run lint`、`bun run ts-check`、`bun run doc:check`(保持 0/0);
5. `bun run build` → `dist/bin/meld-ts.js` 产出,`bun run test:a11y-build` 全绿(bin 链路真实走通);
6. `bun run a11y:sync` → 生成文件写入 `bin/a11y-probe/`;表内容 diff 还原后 `bun run test:a11y-lint` 全绿。

## 6. 决策记录(2026-11-28 用户裁决)

- **A. `test:bin`**:加 script(`bun test bin/`,**不带** `--coverage`,避免 bunfig 的 100% 门槛对 bin 生效);**挂进 CI**(pr-check.yml Test 后加一步)——meld-ts CLI 随 npm 包发布,测试按需写,写了就要跑。
- **B. biome 继续管 bin**:lint + fmt 与 scripts/ 同等待遇;生成文件随目录迁移,待遇不变。
- **C. `a11y:sync` 完整跑一次**:写入位置验证后,表内容 diff 先还原、数据更新单独提交;还原后跑 `bun run test:a11y-lint`(lab 按表头版本精确安装,验证提交进仓库的版本)。
- AGENTS.md 已由用户同步更新(例外条款删除、测试 5 改为 `bun run test:bin`)。

## 7. AGENTS.md 修改记录(用户维护)

1. 「代码规范 3」:`src/` 里不用 `node:` 模块——例外已删除(2026-11-28)。
2. 「测试 5」:已更新为 `bin/` 按需写测试、`bun run test:bin` 跑、不要求覆盖率(2026-11-28)。
3. 「a11y」一节:probe 迁出 `src/a11y/` 后的相关表述更新——**待迁移完成后确认**。
4. 生成文件条款:`*.generated.ts` 的位置说明随迁移更新(a11y:sync 写入 `bin/a11y-probe/`)——**待迁移完成后确认**。
