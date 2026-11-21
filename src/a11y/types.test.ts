import { describe, test } from 'bun:test';
import type {
  A11yNameRule,
  A11yRole,
  AriaKey,
  AriaValue,
} from './aria.generated';
import type {
  A11yBuiltinLints,
  BiomeA11yProfile,
  OxlintA11yProfile,
} from './lints';
import type { A11yProfile } from './types';

/** 类型相等断言：Eq<A, B> 为 true 当且仅当 A、B 互相可赋值 */
type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
/** 断言辅助：T 不为 true 时此处即编译错误 */
type Assert<T extends true> = T;
/** 消费类型断言行产生的值，避开 biome noUnusedExpressions */
const check = (..._args: unknown[]): void => {};

describe('aria.generated', () => {
  test('AriaValue distributes by key', () => {
    const a: Assert<Eq<AriaValue<'checked'>, boolean | 'mixed'>> = true;
    const b: Assert<Eq<AriaValue<'expanded'>, boolean>> = true;
    const c: Assert<Eq<AriaValue<'valueNow'>, number>> = true;
    const d: Assert<Eq<AriaValue<'controls'>, string | readonly string[]>> =
      true;
    const e: Assert<Eq<AriaValue<'details'>, string>> = true;
    check(a, b, c, d, e);
  });

  test('name rule marks img as required', () => {
    const a: Assert<Eq<A11yNameRule['img'], 'required'>> = true;
    const b: Assert<Eq<A11yNameRule['separator'], 'optional'>> = true;
    check(a, b);
  });
});

describe('builtin lint profiles', () => {
  test('registry exposes biome and oxlint keys', () => {
    const a: Assert<Eq<keyof A11yBuiltinLints, 'biome' | 'oxlint'>> = true;
    check(a);
  });

  test('profiles satisfy A11yProfile and keep precise data', () => {
    const a: Assert<BiomeA11yProfile extends A11yProfile ? true : false> = true;
    const b: Assert<OxlintA11yProfile extends A11yProfile ? true : false> =
      true;
    const c: Assert<
      Eq<BiomeA11yProfile['roles']['switch']['required'], 'checked'>
    > = true;
    const d: Assert<
      Eq<
        OxlintA11yProfile['roles']['combobox']['required'],
        'expanded' | 'controls'
      >
    > = true;
    check(a, b, c, d);
  });

  test('shrunk role set is the four documented roles', () => {
    const a: Assert<Eq<A11yRole, 'switch' | 'img' | 'separator' | 'combobox'>> =
      true;
    const b: Assert<
      Eq<
        AriaKey,
        | 'checked'
        | 'expanded'
        | 'controls'
        | 'label'
        | 'labelledBy'
        | 'valueNow'
        | 'selected'
        | 'details'
        | 'hidden'
      >
    > = true;
    check(a, b);
  });
});
