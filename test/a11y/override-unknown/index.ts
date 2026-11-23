import {
  type BiomeA11yProfile,
  createA11y,
} from '../../../src/a11y/index.ts';

declare module '../../../src/a11y/index.ts' {
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
