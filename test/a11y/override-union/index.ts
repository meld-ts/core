import { createA11y } from '../../../src/a11y/index.ts';

/** 单侧 supported 的表 A：switch 不允许 hidden */
type ProfileA = {
  meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
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
      requiredWhenFocusable: 'valueNow';
    };
    combobox: {
      required: 'expanded';
      supported: 'expanded' | 'controls' | 'label' | 'labelledBy';
      requiredWhenFocusable: never;
    };
  };
};

/** 双侧 supported 不同的表 B：switch 允许 hidden，img 不含 details */
type ProfileB = {
  meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
  roles: {
    switch: {
      required: 'checked';
      supported: 'checked' | 'label' | 'labelledBy' | 'hidden';
      requiredWhenFocusable: never;
    };
    img: {
      required: never;
      supported: 'label' | 'labelledBy';
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

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /** 两张表各自合法，但 union 不是探针生成的单表形状 */
    biome: ProfileA | ProfileB;
  }
}

export const a11y = createA11y({ lint: 'biome' });
