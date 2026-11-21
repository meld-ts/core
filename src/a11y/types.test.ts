import { describe, test } from 'bun:test';

import type {
  A11yNameRule,
  A11yRole,
  AriaKey,
  AriaValue,
} from './aria.generated';
import { createA11y } from './createA11y';
import type {
  A11yBuiltinLints,
  BiomeA11yProfile,
  OxlintA11yProfile,
} from './lints';
import type {
  A11yLintName,
  A11yOf,
  A11yOptions,
  A11yOutputMode,
  A11yProfile,
  ResolveProfile,
} from './types';

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

// ---- 类型机器 ----
// 以下断言全部在编译期生效（ts-check 为准）；declare 的值运行时
// 不存在，describe.skip 让 bun test 只登记不执行，避免 ReferenceError。
declare const a11yBiome: A11yOf<{ lint: 'biome' }>;
declare const a11yOxlint: A11yOf<{ lint: 'oxlint' }>;
declare const a11yBoth: A11yOf<{
  lint: readonly ['biome', 'oxlint'];
  output: 'html';
}>;
declare const maybeFocus: true | undefined;
declare const onBool: boolean;
declare const maybeBool: boolean | undefined;
declare const idList: string[];

describe.skip('a11y() input constraints', () => {
  test('missing required prop', () => {
    // @ts-expect-error 缺 checked（biome 表 switch.required）
    check(a11yBiome('switch', { label: 'x' }));
  });

  test('unsupported prop', () => {
    // @ts-expect-error img 不支持 checked
    check(a11yBiome('img', { checked: true, label: 'x' }));
  });

  test('misspelled key', () => {
    // @ts-expect-error 拼错的 lable 不在允许键里（Exact 拦截）
    check(a11yBiome('img', { lable: 'x', label: 'y' }));
  });

  test('missing accessible name', () => {
    // @ts-expect-error img 必须给 label / labelledBy
    check(a11yBiome('img', {}));
  });

  test('focusable requires extra props', () => {
    // @ts-expect-error 可聚焦 separator 缺 valueNow
    check(a11yBiome('separator', { focusable: true }));
  });

  test('focusable as true | undefined still requires extra props', () => {
    // @ts-expect-error focusable 变量类型含 true，也要 valueNow
    check(a11yBiome('separator', { focusable: maybeFocus }));
    check(a11yBiome('separator', { focusable: maybeFocus, valueNow: 1 }));
  });

  test('required props reject undefined', () => {
    // @ts-expect-error 必填 checked 不接受 boolean | undefined
    check(a11yBiome('switch', { checked: maybeBool, label: 'x' }));
    check(a11yBiome('switch', { checked: onBool, label: 'x' }));
  });

  test('single-id props reject arrays', () => {
    // @ts-expect-error details 只接受单个 id
    check(a11yBiome('img', { label: 'x', details: ['a', 'b'] }));
  });

  test('required idlist keys reject the literal empty tuple', () => {
    // @ts-expect-error 必填的 controls 传空元组：NoEmpty 会把输出键丢掉，
    // 输出就过不了 oxlint 的表
    check(a11yOxlint('combobox', { expanded: true, controls: [], label: 'x' }));
    check(
      a11yOxlint('combobox', { expanded: true, controls: ['a'], label: 'x' }),
    );
    // string[] 变量仍允许：非元组认不出空数组（NoEmpty 已记录的限制）
    check(
      a11yOxlint('combobox', { expanded: true, controls: idList, label: 'x' }),
    );
  });
});

describe.skip('a11y() output inference', () => {
  test('react output keeps literal values and exact keys', () => {
    const r1 = a11yBiome('switch', { checked: true, label: 'Wi-Fi' });
    const a: Assert<Eq<(typeof r1)['aria-checked'], true>> = true;
    const b: Assert<Eq<(typeof r1)['aria-label'], 'Wi-Fi'>> = true;
    const c: Assert<Eq<(typeof r1)['role'], 'switch'>> = true;
    const d: Assert<
      Eq<Exclude<keyof typeof r1, 'role'>, 'aria-checked' | 'aria-label'>
    > = true;
    check(a, b, c, d);
  });

  test('html output stringifies boolean variables', () => {
    const r = a11yBoth('combobox', {
      expanded: onBool,
      controls: 'm',
      label: 'x',
    });
    const a: Assert<Eq<(typeof r)['aria-expanded'], 'true' | 'false'>> = true;
    check(a);
  });

  test('img with details compiles and keeps exact keys', () => {
    const r2 = a11yBiome('img', { label: 'x', details: 'd' });
    const a: Assert<
      Eq<Exclude<keyof typeof r2, 'role'>, 'aria-label' | 'aria-details'>
    > = true;
    check(a);
  });

  test('aria() has no role and infers optional keys', () => {
    const r4 = a11yBiome.aria({ expanded: maybeBool, controls: ['a', 'b'] });
    const a: Assert<Eq<(typeof r4)['aria-controls'], string>> = true;
    const b: Assert<Eq<keyof typeof r4, 'aria-expanded' | 'aria-controls'>> =
      true;
    const c: Assert<Eq<(typeof r4)['aria-expanded'], boolean | undefined>> =
      true;
    check(a, b, c);
  });

  test('focusable true | undefined makes tabIndex optional', () => {
    const r5 = a11yBiome('separator', {
      focusable: maybeFocus,
      valueNow: 2,
    });
    const a: Assert<Eq<(typeof r5)['tabIndex'], 0 | undefined>> = true;
    check(a);
  });
});

describe.skip('multi-lint merge', () => {
  test('merged output follows html mode', () => {
    const r3 = a11yBoth('switch', { checked: true, label: 'x' });
    const a: Assert<Eq<(typeof r3)['aria-checked'], 'true'>> = true;
    check(a);
  });

  test('oxlint-required controls enforced after merge', () => {
    // @ts-expect-error 合并后 combobox 仍要 oxlint 的 controls
    check(a11yBoth('combobox', { expanded: true, label: 'x' }));
    check(
      a11yBoth('combobox', {
        expanded: true,
        controls: 'm',
        label: 'x',
      }),
    );
  });

  test('biome focusable separator requirement survives merge', () => {
    // @ts-expect-error 合并后可聚焦 separator 要 biome 的 valueNow
    check(a11yBoth('separator', { focusable: true }));
  });

  test('merged meta reports union lint and merged source', () => {
    type Merged = ResolveProfile<readonly ['biome', 'oxlint']>;
    const a: Assert<Eq<Merged['meta']['lint'], 'biome' | 'oxlint'>> = true;
    const b: Assert<Eq<Merged['meta']['source'], 'merged'>> = true;
    const c: Assert<Eq<ResolveProfile<'biome'>['meta']['lint'], 'biome'>> =
      true;
    check(a, b, c);
  });

  test('lint name union resolves through the merge, not a union of tables', () => {
    type Merged = ResolveProfile<'biome' | 'oxlint'>;
    const a: Assert<Eq<Merged['meta']['source'], 'merged'>> = true;
    const b: Assert<Eq<Merged['meta']['lint'], 'biome' | 'oxlint'>> = true;
    check(a, b);
  });

  test('mixed name-or-array selection resolves like the array form', () => {
    type Mixed = ResolveProfile<'biome' | readonly ['oxlint']>;
    const a: Assert<Eq<Mixed, ResolveProfile<readonly ['biome', 'oxlint']>>> =
      true;
    check(a);
  });

  /** 每个 role 归约成 never 的形状：不变量成立的判据 */
  type AllNever = { [R in A11yRole]: never };

  test('merged table keeps the three section 6 invariants', () => {
    type Merged = ResolveProfile<readonly ['biome', 'oxlint']>;
    // required ⊆ supported
    const a: Assert<
      Eq<
        {
          [R in A11yRole]: Exclude<
            Merged['roles'][R]['required'],
            Merged['roles'][R]['supported']
          >;
        },
        AllNever
      >
    > = true;
    // requiredWhenFocusable ⊆ supported
    const b: Assert<
      Eq<
        {
          [R in A11yRole]: Exclude<
            Merged['roles'][R]['requiredWhenFocusable'],
            Merged['roles'][R]['supported']
          >;
        },
        AllNever
      >
    > = true;
    // 名字必填的 role，label 和 labelledBy 都在 supported 里
    const c: Assert<
      Eq<
        {
          [R in A11yRole]: A11yNameRule[R] extends 'required'
            ? Exclude<'label' | 'labelledBy', Merged['roles'][R]['supported']>
            : never;
        },
        AllNever
      >
    > = true;
    check(a, b, c);
  });
});

describe.skip('createA11y lint selection', () => {
  test('empty lint array is a type error', () => {
    // @ts-expect-error 空表退化为没有必填的表，调用会静默通过
    check(createA11y({ lint: [] }));
    // @ts-expect-error as const 的空数组同样拒绝
    check(createA11y({ lint: [] as const }));
  });

  test('array-typed lint variables still compile', () => {
    const mutable: A11yLintName[] = ['biome'];
    const readonlyArr: readonly A11yLintName[] = ['biome'];
    check(createA11y({ lint: mutable }));
    check(createA11y({ lint: readonlyArr }));
  });

  test('never-typed lint array is a type error', () => {
    // @ts-expect-error never[] 同样退化成没有任何必填的空表
    check(createA11y({ lint: [] as never[] }));
    // @ts-expect-error readonly never[] 同样拒绝
    check(createA11y({ lint: [] as readonly never[] }));
  });

  test('misspelled options key is a type error', () => {
    // @ts-expect-error 拼错的 outpt 不是选项键，静默退回 react 是 bug
    check(createA11y({ lint: 'biome', outpt: 'html' }));
    check(createA11y({ lint: 'biome', output: 'html' }));
  });
});

describe.skip('createA11y output mode', () => {
  test('output must be a definite literal, not T | undefined', () => {
    const out: A11yOutputMode | undefined =
      Math.random() > 0.5 ? 'html' : undefined;
    // @ts-expect-error output 类型含 undefined：类型层承诺不了 react 还是
    // html，运行时却按值走，两边会漂
    check(createA11y({ lint: 'biome', output: out }));
    // @ts-expect-error 跨模式默认值：out 已收窄成 'html' | undefined，
    // out ?? 'react' 推成 'html' | 'react'，和双模式变量同型，输出会
    // 同时要求 tabIndex 和 tabindex 两个键
    check(createA11y({ lint: 'biome', output: out ?? 'react' }));
    // 同模式默认值收成单模式：out ?? 'html' 就是 'html'
    check(createA11y({ lint: 'biome', output: out ?? 'html' }));
    // 键缺失走默认 react；确定字面量不受影响
    check(createA11y({ lint: 'biome' }));
    check(createA11y({ lint: 'biome', output: 'html' }));
    const opts: A11yOptions = { lint: 'biome' };
    // @ts-expect-error A11yOptions 的 output 同时含两个模式和 undefined，
    // 非泛型包装同样拦
    check(createA11y(opts));
  });

  test('output must be one mode, not a union of both', () => {
    const mode: A11yOutputMode = Math.random() > 0.5 ? 'react' : 'html';
    // @ts-expect-error 双模式 union：输出类型会同时要求 tabIndex 和
    // tabindex，运行时只发一个
    check(createA11y({ lint: 'biome', output: mode }));
  });
});
