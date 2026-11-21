import type { A11yOf } from '../../../src/a11y/index.ts';

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

/** 双侧 supported 不同的表 B：switch 允许 hidden */
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

/**
 * BadShapeKeys 只挂在 createA11y 参数上，直接构造 A11yOf 会绕过
 * 那道检查：union 重载值必须退回内置表，只有 ProfileB 支持的
 * hidden 不能因此放行。
 */
declare const a: A11yOf<{ lint: 'biome' }>;

// @ts-expect-error union override must fall back to the builtin table (hidden unsupported)
a('switch', { checked: true, label: 'x', hidden: true });
