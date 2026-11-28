/**
 * 负向 fixture（预期 tsc 报错）：
 * `A11yLintOverrides` 的值结构不完整（不是完整 `A11yProfile`）时，
 * `createA11y` 必须在调用点报 `Invalid A11yLintOverrides shape, rerun meld-ts a11y probe`。
 * 断言见 `src/a11y/override.test.ts`「invalid override shape errors…」。
 */

import { createA11y } from '../../../../src/a11y/index.ts';

declare module '../../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /** 键名合法但结构不是 A11yProfile */
    biome: { broken: true };
  }
}

export const a11y = createA11y({ lint: 'biome' });
