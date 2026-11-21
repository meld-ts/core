import type { AriaIdListKey } from './aria.generated';
import type {
  A11yOf,
  A11yOptions,
  LintSelectionCheck,
  OptionsKeyCheck,
  OutputDefiniteCheck,
  OverrideKeyCheck,
} from './types';

/**
 * idlist 属性的运行时最小表：只有这些键的数组值用空格拼接。
 * 其余逻辑全部由类型层保证。
 */
const IDLIST_KEYS = ['controls', 'labelledBy'] as const;
const IDLIST_SET: ReadonlySet<string> = new Set(IDLIST_KEYS);

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
/**
 * 生成数据更新而此处忘记同步时，编译期报错。
 * 导出只为让 noUnusedLocals 认可这条声明，不进公共 API
 * （index.ts 不再导出它）。
 */
export type IdListInSync = Assert<
  Eq<(typeof IDLIST_KEYS)[number], AriaIdListKey>
>;

/** 实现内部用的宽松签名，对外不可见 */
interface A11yCallable {
  (role: string, props: Record<string, unknown>): Record<string, unknown>;
  aria(props: Record<string, unknown>): Record<string, unknown>;
}

/**
 * 绑定项目的 lint 规则表和输出模式，返回可调用的 a11y。
 *
 * 项目里只建一次（`export const a11y = createA11y({ lint: 'biome' })`），
 * 两个入口：
 * - `a11y(role, props)`：按 role 的规则表约束输入，输出带 role 的属性
 * - `a11y.aria(props)`：给原生元素补 ARIA 状态，不带 role
 *
 * 不认识、拼错的属性名是类型错误；缺必填属性同样是类型错误。
 *
 * 已知限制：不能在未解析的泛型 Opt 下转发调用——
 * `function setup<const Opt extends A11yOptions>(o: Opt): A11yOf<Opt> { return createA11y(o); }`
 * 编译不过（OptionsKeyCheck / LintSelectionCheck / OutputDefiniteCheck
 * 要靠具体的键集合才能判定）。
 * 这是有意的 fail-closed，不放宽检查。要复用请直接在这里实例化，或用
 * `A11yOf<typeof options>` 注解（isolatedDeclarations 的写法，见设计 §3）。
 *
 * @param options lint 用哪张（或哪几张）规则表；output 是值的输出形式，
 * 须为确定的 'react' / 'html' 字面量（含 undefined 的变量会被拦下）
 * @returns 可调用的 a11y，附带 a11y.aria 入口
 *
 * @example
 * ```ts
 * const a11y = createA11y({ lint: 'biome' });
 *
 * a11y('switch', { checked: true, label: 'Wi-Fi' });
 * a11y.aria({ expanded: true });
 * ```
 */
export function createA11y<const Opt extends A11yOptions>(
  options: Opt &
    OverrideKeyCheck &
    OptionsKeyCheck<Opt> &
    LintSelectionCheck<Opt> &
    OutputDefiniteCheck<Opt>,
): A11yOf<Opt>;
export function createA11y(options: A11yOptions): unknown {
  const html: boolean = options.output === 'html';

  const convert = (key: string, value: unknown): unknown => {
    if (IDLIST_SET.has(key) && Array.isArray(value)) {
      return value.join(' ');
    }
    if (html && (typeof value === 'boolean' || typeof value === 'number')) {
      return String(value);
    }
    return value;
  };

  const toAttrs = (props: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (key === 'focusable') continue;
      const value = props[key];
      // 空数组按没传处理：[] join 出 ''，不是合法 id 列表。
      // 限制：类型层只认字面量空元组（types.ts 的 NoEmpty），string[]
      // 变量持有 [] 时类型仍带键、运行时跳过，两边会漂。
      if (
        value === undefined ||
        (IDLIST_SET.has(key) && Array.isArray(value) && value.length === 0)
      ) {
        continue;
      }
      out[`aria-${key.toLowerCase()}`] = convert(key, value);
    }
    return out;
  };

  // 运行时实现只能用宽松签名；对外类型由公开重载 createA11y 保证
  const a11y: A11yCallable = Object.assign(
    (role: string, props: Record<string, unknown>): Record<string, unknown> => {
      const attrs = toAttrs(props);
      if (props.focusable === true) {
        attrs[html ? 'tabindex' : 'tabIndex'] = html ? '0' : 0;
      }
      return { role, ...attrs };
    },
    { aria: toAttrs },
  );

  return a11y;
}
