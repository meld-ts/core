import type { A11yOptions, OverrideKeyCheck } from './types';

export declare function createA11y<const Opt extends A11yOptions>(
  options: Opt & OverrideKeyCheck,
): (role: string, props: Record<string, unknown>) => Record<string, unknown>;
