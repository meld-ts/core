import { createA11y } from '../../../src/a11y/index.ts';

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    /** 拼错的键名：biome → biom（形状故意完整，只测键名错误） */
    biom: {
      meta: { lint: 'biome'; version: '2.6.8'; source: 'probe' };
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
  }
}

export const a11y = createA11y({ lint: 'biome' });
