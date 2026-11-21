import { createA11y } from '../../../src/a11y/index.ts';

/**
 * lint 名是 union（变量 / 条件表达式）时的交集语义：
 * biome 和 oxlint 两张重载表的 supported 不同（只有 biome 支持 hidden），
 * 合并后 switch 只允许交集，hidden 必须报错。
 */
declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    biome: {
      meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
      roles: {
        switch: {
          required: 'checked';
          supported: 'checked' | 'label' | 'labelledBy' | 'hidden';
          requiredWhenFocusable: never;
        };
        img: {
          required: never;
          supported: 'label' | 'labelledBy' | 'details';
          requiredWhenFocusable: never;
        };
        separator: {
          required: never;
          supported: 'valueNow' | 'label' | 'labelledBy';
          requiredWhenFocusable: never;
        };
        combobox: {
          required: 'expanded';
          supported: 'expanded' | 'controls' | 'label' | 'labelledBy';
          requiredWhenFocusable: never;
        };
      };
    };
    oxlint: {
      meta: { lint: 'oxlint'; version: '9.9.9'; source: 'probe' };
      roles: {
        switch: {
          required: 'checked';
          supported: 'checked' | 'label' | 'labelledBy';
          requiredWhenFocusable: never;
        };
        img: {
          required: never;
          supported: 'label' | 'labelledBy' | 'details';
          requiredWhenFocusable: never;
        };
        separator: {
          required: never;
          supported: 'valueNow' | 'label' | 'labelledBy';
          requiredWhenFocusable: never;
        };
        combobox: {
          required: 'expanded' | 'controls';
          supported: 'expanded' | 'controls' | 'label' | 'labelledBy';
          requiredWhenFocusable: never;
        };
      };
    };
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
