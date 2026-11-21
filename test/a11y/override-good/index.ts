import { type A11yOf, createA11y } from '../../../src/a11y/index.ts';

declare module '../../../src/a11y/index.ts' {
  interface A11yLintOverrides {
    biome: {
      meta: { lint: 'biome'; version: '9.9.9'; source: 'probe' };
      roles: {
        switch: {
          required: never;
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
          required: 'expanded';
          supported: 'expanded' | 'controls' | 'label' | 'labelledBy';
          requiredWhenFocusable: never;
        };
      };
    };
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
