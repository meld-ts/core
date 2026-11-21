import type { A11yOf, A11yOptions, OverrideKeyCheck } from './types';

export declare function createA11y<const Opt extends A11yOptions>(
  options: Opt & OverrideKeyCheck,
): A11yOf<Opt>;
