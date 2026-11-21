import { createA11y } from '../../../src/a11y/index.ts';

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /** 键名合法但结构不是 A11yProfile */
    biome: { broken: true };
  }
}

export const a11y = createA11y({ lint: 'biome' });
