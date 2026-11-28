/**
 * 负向 fixture（预期 tsc 报错）：
 * `A11yLintOverrides` 里出现未注册的 lint 名时，
 * `createA11y` 必须在调用点报 `Unknown lint name in A11yLintOverrides`。
 * 断言见 `src/a11y/override.test.ts`「unknown override key errors…」。
 */

import { type A11yBuiltinLints, createA11y } from '../../../../src/a11y/index.ts';

type BiomeA11yProfile = A11yBuiltinLints['biome'];

declare module '../../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /**
     * 拼错的键名：biome → biom（形状故意完整，只测键名错误）。
     * 全量表的完整形状直接沿用内置表类型，只换 meta。
     */
    biom: Omit<BiomeA11yProfile, 'meta'> & {
      meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
    };
  }
}

export const a11y = createA11y({ lint: 'biome' });
