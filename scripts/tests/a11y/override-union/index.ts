/**
 * 负向 fixture（预期 tsc 报错）：
 * `A11yLintOverrides` 的值是 union（`ProfileA | ProfileB`）而不是单张表时，
 * `createA11y` 必须在调用点报 `Invalid A11yLintOverrides shape, rerun meld-ts a11y probe`。
 * 断言见 `src/a11y/override.test.ts`「union-typed override value errors…」。
 */

import { type A11yBuiltinLints, createA11y } from '../../../../src/a11y/index.ts';

/** 具体表通过 A11yBuiltinLints 取，公开面只承诺聚合类型 */
type BiomeA11yProfile = A11yBuiltinLints['biome'];

type BiomeMeta = { lint: 'biome'; version: '9.9.9'; source: 'probe' };

/** 单侧 supported 的表 A：switch 不允许 hidden */
type ProfileA = Omit<BiomeA11yProfile, 'meta' | 'roles'> & {
  meta: BiomeMeta;
  roles: Omit<BiomeA11yProfile['roles'], 'switch'> & {
    switch: Omit<BiomeA11yProfile['roles']['switch'], 'supported'> & {
      supported: Exclude<
        BiomeA11yProfile['roles']['switch']['supported'],
        'hidden'
      >;
    };
  };
};

/**
 * 双侧 supported 不同的表 B：switch 额外允许 valuenow，img 不含 details。
 * 与 A 交叉宽窄（B 的 switch 更宽、img 更窄），避免并集被 TS 按
 * 子类型归约掉一个成员、union 检测失效。
 */
type ProfileB = Omit<BiomeA11yProfile, 'meta' | 'roles'> & {
  meta: BiomeMeta;
  roles: Omit<BiomeA11yProfile['roles'], 'switch' | 'img'> & {
    switch: Omit<BiomeA11yProfile['roles']['switch'], 'supported'> & {
      supported: BiomeA11yProfile['roles']['switch']['supported'] | 'valuenow';
    };
    img: Omit<BiomeA11yProfile['roles']['img'], 'supported'> & {
      supported: Exclude<
        BiomeA11yProfile['roles']['img']['supported'],
        'details'
      >;
    };
  };
};

declare module '../../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /** 两张表各自合法，但 union 不是探针生成的单表形状 */
    biome: ProfileA | ProfileB;
  }
}

export const a11y = createA11y({ lint: 'biome' });
