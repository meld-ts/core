import { type BiomeA11yProfile, createA11y } from '../../../src/a11y/index.ts';

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

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /** 两张表各自合法，但 union 不是探针生成的单表形状 */
    biome: ProfileA | ProfileB;
  }
}

export const a11y = createA11y({ lint: 'biome' });
