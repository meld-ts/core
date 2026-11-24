# AGENTS.md

JSX 里的 a11y 属性（`role`、`aria-*`、`tabIndex`）不允许手写，只能通过 `@meld-ts/core/a11y` 的 `a11y()` / `a11y.aria()` 写出。下面 5 条是规则原文，用 a11y 的项目把它抄进自己的 `AGENTS.md`（简版在 `skills/meld-ts-core/SKILL.md`）。本文件只管 a11y 属性写法，仓库其他约定见 `CLAUDE.md`。

## 规则

1. 能用原生元素就用原生元素（button、a、input、select、dialog…）。
2. 原生元素补状态用 `a11y.aria({...})`，不手写 `aria-*`，也不要对原生元素用 `a11y(role, ...)`。
3. 自定义 role 一律用 `a11y(role, {...})`，不手写 `role=` 和 `aria-*`。
4. 需要可聚焦就传 `focusable: true`，不另外手写 `tabIndex`。唯一例外：只能用脚本聚焦的元素手写 `tabIndex={-1}`。
5. 项目统一从 `src/a11y.ts` 导入 `a11y`，`createA11y` 只在这个文件里调，绑定本项目的 lint 和 output。项目若同时跑多种 lint，`createA11y({ lint: [...] })` 要把它们**全部列出**，只绑一种会漏掉另一种的必填约束。

两个入口各管一半：

| 入口 | 用途 | 输出 |
|------|------|------|
| `a11y(role, {...})` | 自定义 role（switch、img…） | `{ role, ...aria-* }`，带 `focusable` 时加 `tabIndex` |
| `a11y.aria({...})` | 原生元素补 aria 状态 | `{ ...aria-* }`，不带 `role` 键 |

## 已知上游缺口

`aria-colindextext` / `aria-rowindextext` 在 React 19 的 `AriaAttributes` 里有，但 aria-query@5.3.2 没收录，jsx-a11y 6.10.2 的 `aria-props` 把它们当无效属性。所以 `AriaKey` 有意只有 51 个键、不含这两个——等 aria-query 补上，`a11y:sync` 会自动带进来，任何地方都不要手工加键。

确实需要这两个属性时，spread 一个普通对象字面量（CI 的 grep 只匹配 JSX 里字面的 `aria-*=` / `role=`，匹配不到对象键）；role 仍走 `a11y()`，不要写成字面：

```tsx
const extra = { 'aria-colindextext': 'Total', 'aria-rowindextext': 'Q3' };

<div {...a11y('gridcell', { colindex: 3 })} {...extra} />;
```

`a11y:sync` 开始产出这两个键后，删掉这个 workaround，换成 `colindextext` / `rowindextext` 输入键。

## CLI 扩展约定

目前唯一的 bin 是 `meld-ts`（`package.json` 的 `"bin"` 只登记这一个）。以后新增任何命令行能力，都作为子命令挂进这个入口，**不新增 bin**：

```
meld-ts <group> <command> [options]
```

- 新 group 的路由加在 `src/bin/meld-ts.ts`；实现放在可单测的模块里。
- 每个命令必须支持 `--help`（stdout + 退出 0），错误走 stderr + 非零退出。
- 打包只走 `bunup.bin.ts` 单一入口，产物在 `dist/bin/`；不把 bin 加进 `exports`。
- 用户侧调用：项目脚本里直接写 `meld-ts ...`，或 `bunx --package @meld-ts/core meld-ts ...`。

## 为什么

`a11y()` 的输出是 spread 进 JSX 的，而 jsx-a11y 这类 lint 规则只读 JSX 里字面写出来的 `role=` / `aria-*`，看不到 spread。改用 `a11y()` 之后，lint 对这些属性不再检查——原来 lint 做的检查由类型接过来：`a11y(role, props)` 按 role 的 lint 规则表约束「必须有什么、允许有什么」，写错在编译时报错。这 5 条规则就是 spread 之外的主要防线。

## CI 检查

PR 检查在 Test 前跑一次 grep（`.github/workflows/pr-check.yml`），排除接入文件 `src/a11y.ts` 和库自身的 `src/a11y/`：

```
rg --pcre2 '\b(role|aria-[a-z]+)\s*=(?!=)|\btabIndex\s*=\s*\{(?!\s*-1\s*\})|\btabIndex\s*=\s*["'\'']|\btabindex\s*=\s*["'\'']' \
  --glob '*.{tsx,jsx}' \
  --glob '!src/a11y/**' \
  --glob '!src/a11y.ts'
```

rg 自身出错（正则坏、缺 PCRE2、命令不在）不放行——exit 2 时用 `git ls-files` 清点仓库的 tsx/jsx，滤掉排除路径（`src/a11y/`、`src/a11y.ts`）后还有文件就失败（`rg failed with exit 2`）；全部在排除路径里、或根本没有 tsx/jsx 才放行（`only excluded tsx/jsx files`）。

它能抓到 `role="x"`、`role = "x"`、`role={var}`、模板串等写法；`tabIndex` 一并抓（`tabIndex={0}`、`tabIndex={var}`，以及字符串形式 `tabIndex="0"` / `tabindex="0"`），唯一例外是手写的字面 `tabIndex={-1}`（§8 规则 4 的脚本聚焦例外）。也会误报普通代码里的 `role = ...` 赋值，以及 `data-role` / `data-aria-label` 这类 data-* 属性（都属 fail-closed：宁可拦下人工排查，不放过真违规），按需加排除。抓不全的变形（比如先拼对象再 spread）靠上面的规则兜。

例外：`.cache/a11y-lab` 的一致性测试 fixture 故意写字面属性——fixture 要喂给 lint，而 lint 看不到 spread（设计见 `docs/requirements/a11y-design.md` §7）。fixture 在 `.cache`（gitignore）里，不进这个检查。
