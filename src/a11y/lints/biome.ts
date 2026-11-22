/**
 * biome 内置规则表。
 *
 * 生成文件，勿手改。biome 2.6.8。
 * Plan A 阶段为手写缩小版（附录 A 实测数据），Plan B 整文件覆盖。
 */
export type BiomeA11yProfile = {
  meta: { lint: 'biome'; version: '2.6.8'; source: 'builtin' };
  roles: {
    switch: {
      required: 'checked';
      supported: 'checked' | 'label' | 'labelledby';
      requiredWhenFocusable: never;
    };
    img: {
      required: never;
      supported: 'label' | 'labelledby' | 'details';
      requiredWhenFocusable: never;
    };
    separator: {
      required: never;
      supported: 'valuenow' | 'label' | 'labelledby';
      requiredWhenFocusable: 'valuenow';
    };
    combobox: {
      required: 'expanded';
      supported: 'expanded' | 'controls' | 'label' | 'labelledby';
      requiredWhenFocusable: never;
    };
  };
};
