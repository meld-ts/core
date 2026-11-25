import { describe, test } from 'bun:test';

import type {
  A11yNameRule,
  A11yRole,
  AriaKey,
  AriaValue,
} from './aria.generated';
import { createA11y } from './createA11y';
import type { A11yBuiltinLints } from './lints';
import type { BiomeA11yProfile } from './lints/biome';
import type { BunA11yProfile } from './lints/bun';
import type { EslintA11yProfile } from './lints/eslint';
import type { OxlintA11yProfile } from './lints/oxlint';
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
    const c: Assert<Eq<AriaValue<'valuenow'>, number>> = true;
    const d: Assert<Eq<AriaValue<'controls'>, string | readonly string[]>> =
      true;
    const e: Assert<Eq<AriaValue<'details'>, string>> = true;
    check(a, b, c, d, e);
  });

  test('aria keys use the final output form', () => {
    const a: Assert<Eq<AriaValue<'valuenow'>, number>> = true;
    const b: Assert<Eq<AriaValue<'labelledby'>, string | readonly string[]>> =
      true;
    check(a, b);
  });

  test('name rule marks img as required', () => {
    const a: Assert<Eq<A11yNameRule['img'], 'required'>> = true;
    const b: Assert<Eq<A11yNameRule['separator'], 'optional'>> = true;
    check(a, b);
  });

  test('tokenlist values map to string', () => {
    // aria-relevant 是 tokenlist：空格分隔的组合值（'additions text'）
    // 合法，单 token 并集表达不了，映射成 string（§12.14）
    const a: Assert<Eq<AriaValue<'relevant'>, string>> = true;
    check(a);
  });
});

describe('builtin lint profiles', () => {
  test('registry exposes the four lint keys', () => {
    const a: Assert<
      Eq<keyof A11yBuiltinLints, 'eslint' | 'bun' | 'oxlint' | 'biome'>
    > = true;
    check(a);
  });

  test('profiles satisfy A11yProfile and keep precise data', () => {
    const a: Assert<BiomeA11yProfile extends A11yProfile ? true : false> = true;
    const b: Assert<OxlintA11yProfile extends A11yProfile ? true : false> =
      true;
    const c: Assert<EslintA11yProfile extends A11yProfile ? true : false> =
      true;
    const d: Assert<BunA11yProfile extends A11yProfile ? true : false> = true;
    // 生成表的固定事实：断言探针结果里最稳定的代表 role，
    // 数据漂移时这三行会先红，提示重跑 a11y:sync。
    const e: Assert<
      Eq<BiomeA11yProfile['roles']['switch']['required'], 'checked'>
    > = true;
    const f: Assert<
      Eq<
        BiomeA11yProfile['roles']['separator']['requiredWhenFocusable'],
        'valuenow'
      >
    > = true;
    const g: Assert<
      Eq<
        EslintA11yProfile['roles']['combobox']['required'],
        'controls' | 'expanded'
      >
    > = true;
    check(a, b, c, d, e, f, g);
  });

  test('full role and key sets cover the representative members', () => {
    // 127 role / 51 key 的全集逐字面量断言不可维护；改断言代表成员
    // 覆盖各形态：必填表、hyphen 命名、prohibited 名字规则。
    const a: Assert<
      Eq<
        Exclude<
          | 'switch'
          | 'combobox'
          | 'option'
          | 'treeitem'
          | 'separator'
          | 'img'
          | 'heading'
          | 'slider'
          | 'generic'
          | 'graphics-symbol'
          | 'doc-abstract',
          A11yRole
        >,
        never
      >
    > = true;
    const b: Assert<
      Eq<
        Exclude<
          | 'checked'
          | 'expanded'
          | 'controls'
          | 'label'
          | 'labelledby'
          | 'valuenow'
          | 'selected'
          | 'details'
          | 'hidden'
          | 'activedescendant'
          | 'level'
          | 'braillelabel',
          AriaKey
        >,
        never
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
declare const nameVar: string;
declare const maybeEmptyName: '' | 'x';
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
    // @ts-expect-error img 必须给 label / labelledby
    check(a11yBiome('img', {}));
  });

  test('focusable requires extra props', () => {
    // @ts-expect-error 可聚焦 separator 缺 valuenow
    check(a11yBiome('separator', { focusable: true }));
  });

  test('focusable as true | undefined still requires extra props', () => {
    // @ts-expect-error focusable 变量类型含 true，也要 valuenow
    check(a11yBiome('separator', { focusable: maybeFocus }));
    check(a11yBiome('separator', { focusable: maybeFocus, valuenow: 1 }));
  });

  test('conditional-spread focusable counts as key presence', () => {
    const cond = Math.random() > 0.5;
    check(
      // @ts-expect-error 条件展开把 focusable 推成可选键（focusable?: true）：
      // 键在 I 里、值含 true 就按可聚焦要求 valuenow（§3 宁可多要求），
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
    // 成员的 unknown 并起来吸收成 unknown，valuenow 的额外必填静默失效
    check(a11yBiome('separator', cond ? { focusable: true } : { label: 'x' }));
    // @ts-expect-error 同一漏洞的镜像：分支 1 的 img 没给名字也静默通过
    check(a11yBiome('img', cond ? { labelledby: [] } : { label: 'b' }));
    // 拆开调用：各分支的 props 单独合法
    check(a11yBiome('separator', { focusable: true, valuenow: 1 }));
    check(a11yBiome('separator', { label: 'x' }));
    check(a11yBiome('img', { labelledby: ['a'] }));
    check(a11yBiome('img', { label: 'b' }));
  });

  test('focusable: false is rejected', () => {
    // @ts-expect-error focusable 只收 true（§3 / 审查 02 M1）：
    // 不可聚焦就不写 focusable
    check(a11yBiome('separator', { focusable: false, valuenow: 1 }));
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

  test('name-required roles reject the literal empty tuple for labelledby', () => {
    // @ts-expect-error img 名字必填：labelledby 空元组被 NoEmpty 归一成
    // undefined，等于没给名字（§4 的 label / labelledby 至少一个落空）
    check(a11yBiome('img', { labelledby: [] }));
    check(a11yBiome('img', { label: 'x' }));
    check(a11yBiome('img', { labelledby: ['a'] }));
    // label 已给名时不拦：空 labelledby 只是死键，NoEmpty 丢掉它，
    // label / labelledby 至少一个已经满足
    check(a11yBiome('img', { label: 'x', labelledby: [] }));
    // string[] 变量仍允许：非元组认不出空数组（NoEmpty 已记录的限制）
    check(a11yBiome('img', { labelledby: idList }));
  });

  test('name-required roles reject union values containing the empty tuple', () => {
    // @ts-expect-error 值是含空元组的 union：NoEmpty 归一后等于可能没给
    // 名字，label / labelledby 至少一个落空
    check(a11yBiome('img', { labelledby: maybeEmptyIds }));
    // 非空元组的 union 不触发
    check(a11yBiome('img', { labelledby: nonEmptyIds }));
  });

  test('name-required roles reject all-empty-member idlist arrays', () => {
    // @ts-expect-error labelledby: [''] 成员类型恰为 ''：join 出 ''，运行时
    // 按「没传」跳过，等于没给名字（NoEmpty 同源）
    check(a11yBiome('img', { labelledby: [''] }));
    // @ts-expect-error 同一条：['',''] join 出 ' '，trim 后为空
    check(a11yBiome('img', { labelledby: ['', ''] }));
    // 混入非空成员：join 出 ' a'，运行时照常输出，不拦
    check(a11yBiome('img', { labelledby: ['', 'a'] }));
  });

  test('name-required roles reject the literal empty string', () => {
    // @ts-expect-error img 名字必填：label 空串运行时按「没传」跳过
    // （NoEmpty 同源），等于没给名字
    check(a11yBiome('img', { label: '' }));
    // @ts-expect-error 同一条承诺的 labelledby 侧：空串同样被跳过
    check(a11yBiome('img', { labelledby: '' }));
    // 正例：非空 label 与 string 变量照常编译（变量持 '' 认不出，
    // 是 NoEmpty 已记录的限制）
    check(a11yBiome('img', { label: 'x' }));
    check(a11yBiome('img', { label: nameVar }));
    // 另一边给了非空名：空的这边只是死键，NoEmpty 丢掉它不算失约
    check(a11yBiome('img', { label: '', labelledby: 'x' }));
    check(a11yBiome('img', { label: 'x', labelledby: '' }));
  });

  test('name-required roles reject undefined as a provided name', () => {
    // @ts-expect-error label: undefined 是提供了的名字键，但运行时按
    // 「没传」跳过——undefined 计入 label 的空值集，配上空串 labelledby
    // 等于没给名字
    check(a11yBiome('img', { label: undefined, labelledby: '' }));
    // @ts-expect-error 镜像：label 空串 + labelledby undefined 同样落空
    check(a11yBiome('img', { label: '', labelledby: undefined }));
    // @ts-expect-error 只有 label: undefined：名字必填落空
    check(a11yBiome('img', { label: undefined }));
    // 正例：另一边给了非空名，undefined 的这边只是死键，NoEmpty 丢掉它
    // 不算失约
    check(a11yBiome('img', { label: 'x', labelledby: undefined }));
  });

  test('required idlist keys reject the literal empty string', () => {
    // @ts-expect-error 必填的 controls 传空串：运行时按「没传」跳过，
    // 「输出过选中的表」的承诺落空
    check(a11yOxlint('combobox', { expanded: true, controls: '', label: 'x' }));
    check(
      a11yOxlint('combobox', { expanded: true, controls: 'm', label: 'x' }),
    );
  });

  test('required idlist keys reject all-empty-member arrays', () => {
    check(
      // @ts-expect-error 必填的 controls 传 ['']：join 出 ''，运行时按
      // 「没传」跳过，输出就过不了 oxlint 的表（['',''] join 出 ' ' 同理）
      a11yOxlint('combobox', { expanded: true, controls: [''], label: 'x' }),
    );
    check(
      a11yOxlint('combobox', {
        expanded: true,
        controls: ['', 'a'],
        label: 'x',
      }),
    );
  });

  test('tokenlist values accept space-separated combinations', () => {
    check(a11yBiome('alert', { relevant: 'additions text' }));
    check(a11yBiome('alert', { relevant: 'additions' }));
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

  test('html output maps the section 3 value table', () => {
    const h1 = a11yBoth('switch', { checked: false, label: 'x' });
    const a: Assert<Eq<(typeof h1)['aria-checked'], 'false'>> = true;
    const h2 = a11yBoth('switch', { checked: 'mixed', label: 'x' });
    const b: Assert<Eq<(typeof h2)['aria-checked'], 'mixed'>> = true;
    const h3 = a11yBoth('separator', { valuenow: 50, label: 'x' });
    const c: Assert<Eq<(typeof h3)['aria-valuenow'], '50'>> = true;
    const h4 = a11yBoth('separator', { focusable: true, valuenow: 50 });
    const d: Assert<Eq<(typeof h4)['tabindex'], '0'>> = true;
    const e: Assert<Eq<Extract<keyof typeof h4, 'tabIndex'>, never>> = true;
    check(a, b, c, d, e);
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
      valuenow: 2,
    });
    const a: Assert<Eq<(typeof r5)['tabIndex'], 0 | undefined>> = true;
    check(a);
  });

  test('conditional-spread focusable with valuenow keeps tabIndex optional', () => {
    const cond = Math.random() > 0.5;
    const r5 = a11yBiome('separator', {
      label: 'x',
      valuenow: 50,
      ...(cond ? { focusable: true } : {}),
    });
    const a: Assert<Eq<(typeof r5)['tabIndex'], 0 | undefined>> = true;
    check(a);
  });

  test('optional idlist empty tuple drops the output key', () => {
    const r = a11yBiome('separator', { labelledby: [] });
    const a: Assert<Eq<Extract<keyof typeof r, 'aria-labelledby'>, never>> =
      true;
    check(a);
  });

  test('all-empty-member idlist arrays drop the output key', () => {
    // 成员类型恰为 '' 的数组（['']、['','']）与空元组同一条归一：
    // join 出 '' / ' '，运行时都按「没传」跳过
    const r1 = a11yBiome('separator', { labelledby: [''] });
    const r2 = a11yBiome('separator', { labelledby: ['', ''] });
    const a: Assert<Eq<Extract<keyof typeof r1, 'aria-labelledby'>, never>> =
      true;
    const b: Assert<Eq<Extract<keyof typeof r2, 'aria-labelledby'>, never>> =
      true;
    check(a, b);
  });

  test('empty string name and idlist values drop the output key', () => {
    // label / idlist 键的字面量空串与空元组同一条归一（NoEmpty）：
    // 键消失，与运行时的跳过对齐
    const r1 = a11yBiome('separator', { label: '' });
    const r2 = a11yBiome('separator', { labelledby: '' });
    const r3 = a11yBiome('combobox', {
      expanded: true,
      controls: '',
      label: 'x',
    });
    const a: Assert<Eq<Extract<keyof typeof r1, 'aria-label'>, never>> = true;
    const b: Assert<Eq<Extract<keyof typeof r2, 'aria-labelledby'>, never>> =
      true;
    const c: Assert<Eq<Extract<keyof typeof r3, 'aria-controls'>, never>> =
      true;
    // 含空串的 union：键变可选，值收窄到非空成员
    const r4 = a11yBiome('separator', { label: maybeEmptyName });
    const d: Assert<Eq<(typeof r4)['aria-label'], 'x' | undefined>> = true;
    check(a, b, c, d);
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
    // @ts-expect-error 合并后可聚焦 separator 要 biome 的 valuenow
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

  /**
   * 三条 §6 不变量的判据形状（对合并表 M 逐 role 归约，全部 never 才成立）。
   * 注意必须在 M 为具体类型别名时使用：Eq 与映射类型套在泛型 P 上时
   * ResolveProfile 会延迟求值、结果失真（TS 条件类型的已知坑）。
   */
  type RequiredSubset<M extends A11yProfile> = {
    [R in A11yRole]: Exclude<
      M['roles'][R]['required'],
      M['roles'][R]['supported']
    >;
  };
  type FocusableSubset<M extends A11yProfile> = {
    [R in A11yRole]: Exclude<
      M['roles'][R]['requiredWhenFocusable'],
      M['roles'][R]['supported']
    >;
  };
  type NamedSubset<M extends A11yProfile> = {
    [R in A11yRole]: A11yNameRule[R] extends 'required'
      ? Exclude<'label' | 'labelledby', M['roles'][R]['supported']>
      : never;
  };

  test('all six pairwise merges keep the three section 6 invariants', () => {
    // 逐对具体别名：required / requiredWhenFocusable ⊆ supported，
    // 名字必填 role 的 label / labelledby 在 supported。supported 取交集后
    // 仍成立，说明任何一张表必填的属性都在其余表的 supported 里。
    type EB = ResolveProfile<readonly ['eslint', 'bun']>;
    type EO = ResolveProfile<readonly ['eslint', 'oxlint']>;
    type EM = ResolveProfile<readonly ['eslint', 'biome']>;
    type BO = ResolveProfile<readonly ['bun', 'oxlint']>;
    type BM = ResolveProfile<readonly ['bun', 'biome']>;
    type OM = ResolveProfile<readonly ['oxlint', 'biome']>;
    const a: Assert<Eq<RequiredSubset<EB>, AllNever>> = true;
    const b: Assert<Eq<FocusableSubset<EB>, AllNever>> = true;
    const c: Assert<Eq<NamedSubset<EB>, AllNever>> = true;
    const d: Assert<Eq<RequiredSubset<EO>, AllNever>> = true;
    const e: Assert<Eq<FocusableSubset<EO>, AllNever>> = true;
    const f: Assert<Eq<NamedSubset<EO>, AllNever>> = true;
    const g: Assert<Eq<RequiredSubset<EM>, AllNever>> = true;
    const h: Assert<Eq<FocusableSubset<EM>, AllNever>> = true;
    const i: Assert<Eq<NamedSubset<EM>, AllNever>> = true;
    const j: Assert<Eq<RequiredSubset<BO>, AllNever>> = true;
    const k: Assert<Eq<FocusableSubset<BO>, AllNever>> = true;
    const l: Assert<Eq<NamedSubset<BO>, AllNever>> = true;
    const m: Assert<Eq<RequiredSubset<BM>, AllNever>> = true;
    const n: Assert<Eq<FocusableSubset<BM>, AllNever>> = true;
    const o: Assert<Eq<NamedSubset<BM>, AllNever>> = true;
    const p: Assert<Eq<RequiredSubset<OM>, AllNever>> = true;
    const q: Assert<Eq<FocusableSubset<OM>, AllNever>> = true;
    const r: Assert<Eq<NamedSubset<OM>, AllNever>> = true;
    check(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r);
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
