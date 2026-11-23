# AGENTS.md

JSX 里的 a11y 属性（`role`、`aria-*`、`tabIndex`）不允许手写，只能通过 `@meld-ts/core/a11y` 的 `a11y()` / `a11y.aria()` 写出。下面 5 条是规则原文，用 a11y 的项目把它抄进自己的 `AGENTS.md`（简版在 `skills/meld-ts-core/SKILL.md`）。本文件只管 a11y 属性写法，仓库其他约定见 `CLAUDE.md`。

## 规则

1. 能用原生元素就用原生元素（button、a、input、select、dialog…）。
2. 原生元素补状态用 `a11y.aria({...})`，不手写 `aria-*`，也不要对原生元素用 `a11y(role, ...)`。
3. 自定义 role 一律用 `a11y(role, {...})`，不手写 `role=` 和 `aria-*`。
4. 需要可聚焦就传 `focusable: true`，不另外手写 `tabIndex`。唯一例外：只能用脚本聚焦的元素手写 `tabIndex={-1}`。
5. 项目统一从 `src/a11y.ts` 导入 `a11y`，`createA11y` 只在这个文件里调，绑定本项目的 lint 和 output。

两个入口各管一半：

| 入口 | 用途 | 输出 |
|------|------|------|
| `a11y(role, {...})` | 自定义 role（switch、img…） | `{ role, ...aria-* }`，带 `focusable` 时加 `tabIndex` |
| `a11y.aria({...})` | 原生元素补 aria 状态 | `{ ...aria-* }`，不带 `role` 键 |

## 为什么

`a11y()` 的输出是 spread 进 JSX 的，而 jsx-a11y 这类 lint 规则只读 JSX 里字面写出来的 `role=` / `aria-*`，看不到 spread。改用 `a11y()` 之后，lint 对这些属性不再检查——原来 lint 做的检查由类型接过来：`a11y(role, props)` 按 role 的 lint 规则表约束「必须有什么、允许有什么」，写错在编译时报错。这 5 条规则就是 spread 之外的主要防线。

## CI 检查

PR 检查在 Test 前跑一次 grep（`.github/workflows/pr-check.yml`），排除接入文件 `src/a11y.ts` 和库自身的 `src/a11y/`：

```
rg --pcre2 '\b(role|aria-[a-z]+)\s*=(?!=)|\btabIndex\s*=\s*\{(?!\s*-1\s*\})' \
  --glob '*.{tsx,jsx}' \
  --glob '!src/a11y/**' \
  --glob '!src/a11y.ts'
```

rg 自身出错（正则坏、缺 PCRE2、命令不在）不放行——exit 2 时用 `git ls-files` 清点仓库的 tsx/jsx，滤掉排除路径（`src/a11y/`、`src/a11y.ts`）后还有文件就失败（`rg failed with exit 2`）；全部在排除路径里、或根本没有 tsx/jsx 才放行（`only excluded tsx/jsx files`）。

它能抓到 `role="x"`、`role = "x"`、`role={var}`、模板串等写法；`tabIndex` 一并抓（`tabIndex={0}`、`tabIndex={var}`，只覆盖 JSX 花括号写法），唯一例外是手写的字面 `tabIndex={-1}`（§8 规则 4 的脚本聚焦例外）。也会误报普通代码里的 `role = ...` 赋值，按需加排除。抓不全的变形（比如先拼对象再 spread）靠上面的规则兜。

例外：`.cache/a11y-lab` 的一致性测试 fixture 故意写字面属性——fixture 要喂给 lint，而 lint 看不到 spread（设计见 `docs/requirements/a11y-design.md` §7）。fixture 在 `.cache`（gitignore）里，不进这个检查。
