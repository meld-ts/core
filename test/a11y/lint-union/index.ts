import {
  type BiomeA11yProfile,
  type OxlintA11yProfile,
  createA11y,
} from '../../../src/a11y/index.ts';

/**
 * lint 名是 union（变量 / 条件表达式）时的交集语义：
 * biome 和 oxlint 两张重载表的 switch supported 不同（只有 biome 支持
 * hidden），合并后 switch 只允许交集，hidden 必须报错。
 * 全量内置表逐字面量重写不现实，两表均基于内置表类型改个别 role。
 */
type BiomeProbe = Omit<BiomeA11yProfile, 'meta' | 'roles'> & {
  meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
  roles: Omit<BiomeA11yProfile['roles'], 'combobox'> & {
    combobox: Omit<
      BiomeA11yProfile['roles']['combobox'],
      'requiredWhenFocusable'
    > & {
      requiredWhenFocusable: 'controls';
    };
  };
};

type OxlintProbe = Omit<OxlintA11yProfile, 'meta' | 'roles'> & {
  meta: { lint: 'oxlint'; version: '9.9.9'; source: 'probe' };
  roles: Omit<OxlintA11yProfile['roles'], 'switch'> & {
    switch: Omit<OxlintA11yProfile['roles']['switch'], 'supported'> & {
      supported: Exclude<
        OxlintA11yProfile['roles']['switch']['supported'],
        'hidden'
      >;
    };
  };
};

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    biome: BiomeProbe;
    oxlint: OxlintProbe;
  }
}

const lint: 'biome' | 'oxlint' = Math.random() > 0.5 ? 'biome' : 'oxlint';
const a11y = createA11y({ lint });

export const attrs: Record<string, unknown> = a11y('switch', {
  checked: true,
  label: 'x',
  // @ts-expect-error hidden is supported by only biome; a union must intersect
  hidden: true,
});

/**
 * 混合形状（名字 | 数组，条件表达式推出来的类型）同一条不变量：
 * 展平成名字并集后取交集，不能拆成两张表的并集。
 */
const mixed: 'biome' | readonly ['oxlint'] =
  Math.random() > 0.5 ? 'biome' : (['oxlint'] as const);
const a11yMixed = createA11y({ lint: mixed });

export const attrsMixed: Record<string, unknown> = a11yMixed('switch', {
  checked: true,
  label: 'x',
  // @ts-expect-error hidden is supported by only biome; a mixed selection must intersect
  hidden: true,
});

/**
 * requiredWhenFocusable 的 idlist 键同样拦字面量空元组。用 biome 单表
 * 的实例：combobox 的 controls 只在 focusable 激活时必填（不在
 * required 里），空元组只有这一侧的拦截管得住——`controls: []` 会让
 * NoEmpty 把输出键丢掉，和 required 集合同一条承诺。
 */
const a11yBiome = createA11y({ lint: 'biome' });

export const focusAttrs: Record<string, unknown> = a11yBiome('combobox', {
  expanded: true,
  label: 'x',
  focusable: true,
  controls: ['a'],
});

// @ts-expect-error controls 传空元组：输出键会被 NoEmpty 丢掉，过不了表
export const focusEmpty: Record<string, unknown> = a11yBiome('combobox', {
  expanded: true,
  label: 'x',
  focusable: true,
  controls: [],
});
