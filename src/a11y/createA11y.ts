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
const IDLIST_KEYS = [
  'controls',
  'describedby',
  'flowto',
  'labelledby',
  'owns',
] as const;
const IDLIST_SET: ReadonlySet<string> = new Set(IDLIST_KEYS);

/**
 * 运行时跳过空值的键：名字键 label，加全部 idlist 键。空串按「没传」
 * 处理；idlist 数组 join 出的值 trim 后为空（空数组、['']、['','']）与
 * 空串同一条路径（types.ts 的 NoEmpty 同源）。
 */
const isEmptyValue = (key: string, value: unknown): boolean => {
  if (IDLIST_SET.has(key)) {
    return Array.isArray(value) ? value.join(' ').trim() === '' : value === '';
  }
  return key === 'label' && value === '';
};

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
 * ## 覆盖内置规则表（override）
 *
 * 内置表按发布时的 lint 版本探测生成。项目里的 lint 版本不同、或规则有本地
 * 差异时，用 `meld-ts a11y probe` 按项目实际安装的 lint 重新生成一张表：
 *
 * ```bash
 * meld-ts a11y probe --lint=biome   # 默认写出 a11y-lints.generated.d.ts
 * ```
 *
 * 生成文件通过声明合并把表挂进 `A11yLintOverrides`，`createA11y` 会自动使用：
 *
 * ```ts
 * // a11y-lints.generated.d.ts（探针生成，勿手改）
 * export {};
 * declare module '@meld-ts/core/a11y' {
 *   interface A11yLintOverrides {
 *     biome: { meta: { lint: 'biome'; version: '2.6.8'; source: 'probe' }; roles: { ... } };
 *   }
 * }
 * ```
 *
 * 约束：
 * - 值必须是**完整的** `A11yProfile`（`meta` + 全部 127 个 role），不是局部
 *   补丁。只改个别 role 时，在完整表上用 `Omit` 改，写法见
 *   `test/a11y/override-good/index.ts`。
 * - 不能是 union（`ProfileA | ProfileB`）：会在 `createA11y` 调用点报
 *   `Invalid A11yLintOverrides shape, rerun meld-ts a11y probe`。负例见
 *   `test/a11y/override-union/index.ts`。
 * - 未注册的 lint 名会报 `Unknown lint name in A11yLintOverrides`。
 * - 覆盖是**整表替换**，不与内置表合并；漏掉的 role 等于没有这张表。
 *
 * override 只作用于类型层，运行时不受影响。放宽表就是放宽与实际 lint 的对齐
 * ——手写放宽会对真实 lint fail-open，改动请以探针输出为准。
 *
 * @param options lint 用哪张（或哪几张）规则表；output 是值的输出形式，
 * 须为单个模式——确定的 'react' / 'html' 字面量（含 undefined 或同时含
 * 两个模式的类型会被拦下）。'html' 面向 DOM API 和字符串模板，
 * boolean / number 会字符串化；不要把它 spread 进有类型的 React JSX
 * （React 把 aria-valuenow / aria-level 等类型成 number，过不了 tsc），
 * React 用默认的 'react'
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
      // 空值按没传处理：idlist 数组 join 后 trim 为空（空数组、['']、
      // ['','']），label / idlist 空串同样不是合法输出。
      // 限制：类型层只认字面量空元组 / 全空串成员数组 / 空串（types.ts
      // 的 NoEmpty），string / string[] 变量持空值时类型仍带键、运行时
      // 跳过，两边会漂。
      if (value === undefined || isEmptyValue(key, value)) {
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
