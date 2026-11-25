import {
  type A11yBuiltinLints,
  type A11yOf,
  createA11y,
} from '../../../src/a11y/index.ts';

type BiomeA11yProfile = A11yBuiltinLints['biome'];

/**
 * 全量内置表（127 role）逐字面量重写不现实；重载表基于内置表类型
 * 改个别 role，保持 A11yProfile 的结构完整（这是重载生效的前提）。
 */
type OverrideBiome = Omit<BiomeA11yProfile, 'meta' | 'roles'> & {
  meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
  roles: Omit<BiomeA11yProfile['roles'], 'switch'> & {
    switch: Omit<BiomeA11yProfile['roles']['switch'], 'required'> & {
      required: never;
    };
  };
};

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    biome: OverrideBiome;
  }
}

const options = { lint: 'biome' } as const;

/**
 * 重载生效的编译证据：
 * override 把 switch.required 改为 never，缺 checked 不报错。
 */
export const result: Record<string, unknown> = createA11y(options)('switch', {
  label: 'x',
});

/** isolatedDeclarations 下的消费写法（设计 §3） */
export const a11y: A11yOf<typeof options> = createA11y(options);
