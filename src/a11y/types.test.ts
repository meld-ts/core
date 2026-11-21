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
declare const maybeEmptyIds: readonly [] | readonly ['a'];
declare const nonEmptyIds: readonly ['a'] | readonly ['a', 'b'];
declare const rolePair: 'switch' | 'img';
declare const roleUnion: A11yRole;

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

  test('conditional-spread focusable counts as key presence', () => {
    const cond = Math.random() > 0.5;
    check(
      // @ts-expect-error 条件展开把 focusable 推成可选键（focusable?: true）：
      // 键在 I 里、值含 true 就按可聚焦要求 valueNow（§3 宁可多要求），
      // 形状匹配（I extends { focusable: unknown }）判不中可选键
      a11yBiome('separator', {
        label: 'x',
        ...(cond ? { focusable: true } : {}),
      }),
    );
  });

  test('union-typed props are rejected at the call site', () => {
    const cond = Math.random() > 0.5;
    // @ts-expect-error props 是 union：分布检查把「某成员的要求」和其余
    // 成员的 unknown 并起来吸收成 unknown，valueNow 的额外必填静默失效
    check(a11yBiome('separator', cond ? { focusable: true } : { label: 'x' }));
    // @ts-expect-error 同一漏洞的镜像：分支 1 的 img 没给名字也静默通过
    check(a11yBiome('img', cond ? { labelledBy: [] } : { label: 'b' }));
    // 拆开调用：各分支的 props 单独合法
    check(a11yBiome('separator', { focusable: true, valueNow: 1 }));
    check(a11yBiome('separator', { label: 'x' }));
    check(a11yBiome('img', { labelledBy: ['a'] }));
    check(a11yBiome('img', { label: 'b' }));
  });

  test('focusable: false is rejected', () => {
    // @ts-expect-error focusable 只收 true（§3 / 审查 02 M1）：
    // 不可聚焦就不写 focusable
    check(a11yBiome('separator', { focusable: false, valueNow: 1 }));
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

  test('aria() rejects misspelled keys and focusable', () => {
    // @ts-expect-error 拼错的 cheked 不在 AriaKey 里（Exact 拦截）
    check(a11yBiome.aria({ cheked: true }));
    // @ts-expect-error focusable 不是 ARIA 属性，aria() 不收；
    // 可聚焦的 role 走 a11y(role, ...)
    check(a11yBiome.aria({ focusable: true }));
  });

  test('aria() rejects union props', () => {
    const cond = Math.random() > 0.5;
    // @ts-expect-error props 是 union：AriaAttrs 对两个分支各映射一份，
    // keyof 取公共键是 never，一个键都读不出来，运行时却发其中一个分支的
    // 属性，类型和实际输出漂移
    check(a11yBiome.aria(cond ? { expanded: true } : { controls: ['a'] }));
    // 单分支各写各的调用不受影响
    check(a11yBiome.aria({ expanded: true }));
    check(a11yBiome.aria({ controls: ['a'] }));
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

  test('required idlist keys reject union values containing the empty tuple', () => {
    check(
      // @ts-expect-error 值是含空元组的 union：NoEmpty 归一后输出键可能
      // 整个丢掉，同样过不了 oxlint 的表
      a11yOxlint('combobox', {
        expanded: true,
        controls: maybeEmptyIds,
        label: 'x',
      }),
    );
    // 非空元组的 union 不触发
    check(
      a11yOxlint('combobox', {
        expanded: true,
        controls: nonEmptyIds,
        label: 'x',
      }),
    );
  });

  test('name-required roles reject the literal empty tuple for labelledBy', () => {
    // @ts-expect-error img 名字必填：labelledBy 空元组被 NoEmpty 归一成
    // undefined，等于没给名字（§4 的 label / labelledBy 至少一个落空）
    check(a11yBiome('img', { labelledBy: [] }));
    check(a11yBiome('img', { label: 'x' }));
    check(a11yBiome('img', { labelledBy: ['a'] }));
    // label 已给名时不拦：空 labelledBy 只是死键，NoEmpty 丢掉它，
    // label / labelledBy 至少一个已经满足
    check(a11yBiome('img', { label: 'x', labelledBy: [] }));
    // string[] 变量仍允许：非元组认不出空数组（NoEmpty 已记录的限制）
    check(a11yBiome('img', { labelledBy: idList }));
  });

  test('name-required roles reject union values containing the empty tuple', () => {
    // @ts-expect-error 值是含空元组的 union：NoEmpty 归一后等于可能没给
    // 名字，label / labelledBy 至少一个落空
    check(a11yBiome('img', { labelledBy: maybeEmptyIds }));
    // 非空元组的 union 不触发
    check(a11yBiome('img', { labelledBy: nonEmptyIds }));
  });
});

describe.skip('a11y() role literal constraints', () => {
  test('two-role union variable is a type error', () => {
    // @ts-expect-error role 是 union：Rule 分布式取表，supported 变并集，
    // img 不支持的 checked 也静默通过
    check(a11yBiome(rolePair, { checked: true, label: 'x' }));
  });

  test('broad A11yRole variable is a type error', () => {
    // @ts-expect-error 整个 A11yRole 的变量：required / supported 都是各表
    // 的并集，任何属性组合都收得下，名字必填也被 optional 成员的空对象
    // 分支抵消
    check(a11yBiome(roleUnion, { checked: true, expanded: true, label: 'x' }));
  });

  test('single literal roles keep working', () => {
    check(a11yBiome('switch', { checked: true, label: 'x' }));
    check(a11yBiome('img', { label: 'x', details: 'd' }));
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

  test('conditional-spread focusable with valueNow keeps tabIndex optional', () => {
    const cond = Math.random() > 0.5;
    const r5 = a11yBiome('separator', {
      label: 'x',
      valueNow: 50,
      ...(cond ? { focusable: true } : {}),
    });
    const a: Assert<Eq<(typeof r5)['tabIndex'], 0 | undefined>> = true;
    check(a);
  });

  test('optional idlist empty tuple drops the output key', () => {
    const r = a11yBiome('separator', { labelledBy: [] });
    const a: Assert<Eq<Extract<keyof typeof r, 'aria-labelledby'>, never>> =
      true;
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
    // §4：数组（含单元素）一律走 MergeProfiles，meta.source 是 'merged'
    const d: Assert<
      Eq<ResolveProfile<readonly ['biome']>['meta']['source'], 'merged'>
    > = true;
    check(a, b, c, d);
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
    // @ts-expect-error 空选择归约成 never 表，在 createA11y 拦下、
    // 给一条可读的错，而不是把 never 错误漏到每个调用点
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
    // @ts-expect-error never[] 同样归约成 never 表
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
