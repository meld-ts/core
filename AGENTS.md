# @meld-ts/core

零运行时依赖的 TypeScript 工具库，同一份源码打包给 Node.js / Bun 和浏览器。

包内维护以最低成本、最少心智负担为准，写法要一眼就能看懂。转发只用 `export *`、用 tsdown 打包，都是出于这一点。

**❌ 本文件禁止 AI 直接修改**，可以向用户提出修改建议，由用户进行维护。

标 [RP]（Review Point）的条目是 review 时必查的点。没标的，写代码时同样要照做。

## 代码规范

1. lint 和格式化都用 biome，规则以 biome.json 为准。改完跑 `bun run lint` 和 `bun run ts-check`。
2. 不要手动调格式、手动排 import。改完的文件用 `bun fmt <文件路径>` 格式化；全仓格式化用 `bun run fmt:all`。
3. `src/` 里不用 `node:` 模块：同一份源码要打包给浏览器。
4. 不要对 `lint/fixtures/` 里进行代码格式化或重排（忽略里面的 lint 错误）。

### 代码注释

1. 实现里的注释只写 WHY，不写 WHAT。JSDoc 是写给使用方的说明，按下一节写。
2. [RP] 注释用中文，JSDoc 也一样。标识符、API 名和专有术语保持英文。

### JSDoc

公开的符号（入口能 import 到的，见「模块入口与导出」）都要写 JSDoc，`_` 文件里的不要求。push 或开 PR 前跑 `bun run doc:check`，漏写的会直接报错。

1. [RP] 公开的函数和 class 要有 `@example`，用 ts 代码块，覆盖调用方式差别大的几种写法。type、interface 看复杂程度决定写不写。
2. [RP] 会抛错、或返回的 Promise 会 reject 的，写 `@throws`：抛哪个错误类，什么情况下抛。
3. [RP] 带泛型、靠推断的，用 `@typeParam` 写清楚：泛型从哪个参数推出来，返回类型怎么跟着变。
4. [RP] type、interface、class 的每个属性和方法都写 JSDoc。可选属性有默认值的，写 `@defaultValue`。
5. [RP] 公开类型引用了没导出的类型，`doc:check` 会报 referenced 警告。使用方会直接写出这个名字的，就导出它并写 JSDoc；只在内部做类型推导或报错用的，不导出，登记到 `typedoc.json` 的 `intentionallyNotExported`，格式是「项目内相对路径:符号名」，比如 `src/a11y/types.ts:CheckOverride`。
6. [RP] 登记过的类型改了名、换了文件、删了或者改成导出，要同步改 `intentionallyNotExported`：登记了却用不上的条目，`doc:check` 也会报错。不要用 `validation.notExported: false` 把整类检查关掉。

## 模块入口与导出

### index.ts

1. [RP] 转发一律用 `export * from './x'`，纯类型文件可以用 `export type * from`。❌ 不允许逐个列举导出 `export { a, b } from`。
2. 两个文件导出了同名符号，`export *` 会报 TS2308。改名解决，不要改成列举。
3. index.ts 里可以直接写实现。模块只有一个文件，但想把测试放在一起、或者以后会扩充时，就这么做，比如 `src/events/`。

### 内部文件

只给模块内部用、不想公开导出的符号，放进 `_` 开头的文件或目录，[RP] index.ts 不导出 `_` 开头的文件和目录。

几个模块共用的，放 `src/_internal/`。需要时才拆，不是每个模块都要有。

### [RP] 只有定义文件和 index.ts 能导出

一个符号只从定义它的文件导出，再由 index.ts 转发。其他文件不要把别处的符号再导出一遍，类型和值都一样：

```ts
export { TimeoutError } from './errors';  // 转发
import { RpcAbortError } from './errors';
export { RpcAbortError };                  // import 进来再导出
export const TE = TimeoutError;            // 换个名字再导出
```

用到别的文件的符号，就 import 进来自己用。调用方也要用，让调用方自己去 import 定义文件或模块入口。在别的类型上组合出新类型（比如 `Omit<X, 'a'> & {...}`）不算转发。常见写法 `bun run lint` 会拦。

### [RP] 搬文件、改名

改掉所有引用，不在旧位置留转发。改完用 `rg` 搜旧路径和旧名字，测试、README、`skills/` 里的也要改。动到 package.json `exports` 的子路径或公开符号的名字，是破坏性改动，先问。

### 环形引用

`bun run lint` 的 `noImportCycles` 会报环。

## 测试

`bun run test` 跑 `src/` 下的全部测试，覆盖率低于 100% 直接失败（bunfig.toml 的 `coverageThreshold = 1`）。

1. [RP] `src/` 下每个有运行时代码的文件都要 100% 覆盖。测试和被测文件放在一起，命名为 `x.test.ts`。
2. [RP] 新加的文件要有测试 import 它。bun 只统计测试加载过的文件，没被任何测试 import 的文件不进覆盖率报告，100% 的门槛拦不住它。
3. [RP] 不要为了凑到 100% 往 `coveragePathIgnorePatterns` 里加路径，要么补测试，要么删掉走不到的代码。
4. 只有类型、只做转发的文件，以及生成文件（文件头写着「生成文件，勿手改」的），不用单独写测试。
5. `bin/` 按需写测试，用 `bun run test:bin` 跑，不要求覆盖率。

开发时单跑一个文件用 `bun test <路径>`，不要带 `--coverage`：只跑一个文件时，被它顺带加载的其他文件只覆盖到一部分，会报不到 100%，这不是你改坏了。

## TypeScript 版本

仓库里装了两个 TypeScript，各管一件事：

- `typescript`（5.9.3）：只给 typedoc 用。typedoc 0.28 只支持到 TS 6.0，不要把它升到 7。
- `typescript7`（npm 别名，7.0.2）：`bun run ts-check` 和测试里起的 tsc 都用它，比 5.9.3 快好几倍。测试里要起 tsc，就调 `node_modules/typescript7/bin/tsc`。不要写 `bun x tsc`，那样拿到的是 5.9.3。

给使用方的支持范围是 `>=5.9 <8`，只是类型上的承诺，写在 README 的「TypeScript 版本」一节。CI 的 `ts-matrix` 在 5.9.3、6.0.3、7.0.2 三档上跑类型检查。

1. [RP] 不加 `peerDependencies.typescript`。包在运行时不依赖 TypeScript，声明了会让包管理器给纯 JS 用户也装上一个 TS（原因见 README）。
2. [RP] 不要删 `pr-check.yml` 里的 `ts-matrix-ok`。合并规则挂的是这个汇总 job，不是矩阵里的某一档，因为版本一变，那一档的名字就变了。
3. [RP] 改支持范围或工具链版本时，这几处一起改：
    - `package.json` 的两个 typescript
    - `pr-check.yml` 的 `ts-matrix`
    - README 的「TypeScript 版本」
    - CONTRIBUTING.md 的前置要求
    - 本节（向用户提出修改）

   改完在矩阵的每一档上跑 `bunx -p typescript@<版本> tsc -p tsconfig.json --noEmit`，再跑 `bun run doc`，确认 typedoc 还能用。

## a11y

1. 改 `src/a11y/` 前先读 `docs/a11y.md`（用法和规则）和 `docs/requirements/a11y-design.md`（设计）。
2. [RP] 文件头写着「生成文件，勿手改」的（`*.generated.ts`、`src/a11y/lints/_*.ts`），由 `bun run a11y:sync` 生成。要改就改 `scripts/a11y-sync.ts`，然后重新生成。

## CLI 扩展约定

不新增 bin，新命令作为 `meld-ts` 的子命令挂进去；每个命令都要支持 `--help`。

暂空，后补

## 构建

`bun run build` 用 tsdown 打包。选 tsdown，是因为它按源文件拆共享代码：子路径入口共用的模块各成一个 chunk，入口只加载自己用到的文件，ESM 和 CJS 都一样。之前用 bunup 时，一个入口只要 import 了 `../guards`，就会连带加载整份 guards（CJS 每个入口都内联一整份；ESM 要经过打包工具才能摇掉）。

### browser

`browser/` 是给网页 `<script>` 和 CDN 直接引用的单文件产物，跟着 npm 包发布（package.json 的 `files`），但不进 `exports`。

1. [RP] 不要把 `./browser` 加进 `exports`，也不要为此改 README 的用法。TS 在 `moduleResolution: node` 下能直接找到 `browser/index.d.ts`；`bundler` / `nodenext` 下报 TS2307，这是已知的取舍，不是 bug。
2. [RP] 不要改 browser 产物的文件名（`index.js`、`iife.global.js`、`index.d.ts`）：CDN 用户直接引用这些路径。
