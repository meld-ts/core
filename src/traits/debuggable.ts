import { notEmptyString } from '../guards';

/**
 * 生成当前时间的调试时间戳字符串，格式为 `HH:MM:SS.mmm`。
 *
 * @param date 指定日期，默认使用 `new Date()`
 */
export const debugTimeFlag = (date?: Date | null) => {
  const d = date ?? new Date();
  const h = `${d.getHours()}`.padStart(2, '0');
  const m = `${d.getMinutes()}`.padStart(2, '0');
  const s = `${d.getSeconds()}`.padStart(2, '0');
  const ms = `${d.getMilliseconds()}`.padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

/** 自定义调试输出函数签名 */
export type DebugFunction = (...args: unknown[]) => void;

/** 自定义时间戳函数签名，返回要显示的时间字符串 */
export type TimeFlagFunction = (date?: Date | null) => string;

/**
 * 初始化时传入的调试配置，挂载在原型上，所有实例共享。

 * **可变性是有意设计**——`debugConfig` 的字段（如 `name`、`color`）可在
 * `constructor` 中按实例修改。在原型上改一个字段，该字段对所有实例生效；
 * 在实例自有属性上改，仅影响该实例。`debuggable` 提供的默认值只是起点，不是锁死的契约。
 *
 * **安全注意**：`color` / `scopeColor` / `style` / `scopeStyle`
 * 直接拼入 `console.log` 的 `%c` 格式字符串，未做转义。
 * 传入的 CSS 值将原样生效，请确保来源可信。
 *
 * - `name`        — 显示在日志头部的模块名称，默认 `'Debug'`
 * - `color`       — name 的颜色值（仅色值，自动包装为 `color: <value>`），如 `'#ff6b6b'`
 * - `style`       — name 的完整 CSS 样式字符串，优先级高于 `color`，如 `'color: #ff6b6b; font-weight: bold'`
 * - `scopeColor`  — scope 的颜色值（同 `color` 规则）
 * - `scopeStyle`  — scope 的完整 CSS 样式字符串，优先级高于 `scopeColor`
 * - `method`      — 输出方法：`'log'`（默认）、`'debug'`，或自定义函数
 * - `timeFlag`    — 是否在日志头部追加时间戳；`true` 使用内置格式，也可传自定义函数
 * - `format`      — 自定义头部格式函数，返回传给 `console.log` 的参数数组
 */
export interface DebugConfiguration {
  name?: string;
  color?: string;
  style?: string;
  scopeColor?: string;
  scopeStyle?: string;
  method?: 'log' | 'debug' | DebugFunction;
  timeFlag?: boolean | TimeFlagFunction;
  format?: (
    vars: Record<string, string | null | undefined>,
    styles: Record<string, string | null | undefined>,
  ) => string[];
  [key: string]: unknown;
}

/**
 * 运行期调试开关，通过 `setDebug()` 写入实例，每个实例独立持有。
 *
 * - `debug` — 全局开关，控制所有未单独配置的 scope
 * - 其余字段 — 各 scope 的独立开关，优先级高于 `debug`
 */
export interface DebugSettings {
  debug?: boolean;
  [key: string]: unknown;
}

/**
 * `debuggable` 返回的 trait 接口，供 interface 声明合并使用。
 *
 * ```ts
 * // biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
 * class MyService { ... }
 *
 * implTraits(MyService, debuggable({ name: 'MyService', color: 'color: #6bcb77' }))
 *
 * // biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
 * interface MyService extends DebuggableTrait {}
 * ```
 */
export interface DebuggableTrait<
  Settings extends DebugSettings = DebugSettings,
> {
  /**
   * 初始化配置，挂载在原型上，所有实例共享。
   *
   * **可变**——可在 `constructor` 中通过 `this.debugConfig!.name = '...'`
   * 或直接赋值实例自有属性来按实例定制。改原型字段影响所有实例，
   * 改实例自有属性仅影响该实例。
   */
  debugConfig?: Partial<DebugConfiguration>;
  /**
   * 运行期调试开关，`setDebug()` 后成为实例自有属性，每个实例独立。
   *
   * **可变**——可直接读写 `this.debugSettings`。`setDebug()` 是推荐方式
   *（提供合并语义），但手动修改同样有效。
   */
  debugSettings?: Partial<Settings>;

  /**
   * 设置调试开关。
   *
   * - `setDebug(true)` — 开启全局调试
   * - `setDebug(false)` — 关闭全局调试
   * - `setDebug({ fetch: true })` — 仅开启 fetch scope，与已有 settings 合并
   * - `setDebug()` — 无参调用为 no-op
   */
  setDebug(debug?: boolean | Partial<Settings>): this;

  /**
   * 判断指定 scope 是否应输出调试信息。
   *
   * 优先级（由高到低）：
   * 1. `settings[scope]`（精确匹配）
   * 2. `settings[ns]`（取 `scope` 中第一个 `.` 前的命名空间）
   * 3. `settings.debug`（全局开关）
   *
   * @example
   * ```ts
   * svc.setDebug({ debug: false, fetch: true })
   * svc.shouldDebug('fetch')         // true  — scope 精确匹配
   * svc.shouldDebug('fetch.request') // true  — 继承 fetch 命名空间
   * svc.shouldDebug('ws')            // false — 未配置，回落到 debug: false
   * ```
   */
  shouldDebug(
    scope?: keyof Omit<Settings, 'debug'> | string | undefined | null,
  ): boolean;

  /**
   * 在 `shouldDebug(scope)` 为 `true` 时输出调试信息，否则静默返回。
   *
   * 输出格式（默认）：`[时间戳] [name] [scope] ...args`
   * 颜色和格式可通过 `DebugConfiguration` 定制。
   *
   * @param scope 当前调试 scope，传 `null` / `undefined` 表示无 scope
   * @param args  要输出的内容
   */
  debug(
    scope: keyof Omit<Settings, 'debug'> | string | undefined | null,
    ...args: unknown[]
  ): this;

  /**
   * 获取当前调用栈，返回每帧的文本数组。
   *
   * 基于 `new Error().stack`，兼容所有 JS 运行时（V8 / JSC / SpiderMonkey）。
   * V8 环境可用的 `Error.captureStackTrace` 能更精确排除内部帧，
   * 但作为通用库不依赖非标准 API。
   *
   * @param skipFrames — 额外跳过的栈帧数。默认 0
   *   （"Error" 行始终被排除）。典型用法：传 1 跳过 `getStack` 自身，
   *   传 2 再加上调用方的 wrapper。
   * @returns 栈帧字符串数组，每帧已 trim 首尾空白
   *
   * @example
   * ```ts
   * // 输出从调用点开始的完整栈
   * console.log(svc.getStack());
   *
   * // 跳过 getStack 自身，只展示更上层的调用栈
   * console.log(svc.getStack(1));
   * ```
   */
  getStack(skipFrames?: number): string[];
}

/**
 * 创建一个 `DebuggableTrait` 实现对象，配合 `implTraits` 混入到目标类。
 *
 * `config` 在工厂调用时固定，之后通过原型共享给所有实例（只读）。
 * 运行期的调试开关（`debugSettings`）通过 `setDebug()` 写到各实例的自有属性上，
 * 互不干扰。
 *
 * @param config 调试配置（name、color / style、timeFlag 等），详见 {@link DebugConfiguration}
 *
 * @example
 * ```ts
 * type AppSettings = DebugSettings & { http?: boolean; ws?: boolean }
 *
 * // biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
 * class AppService {}
 *
 * implTraits(AppService, debuggable<AppSettings>({
 *   name: 'AppService',
 *   color: '#4dabf7',           // 仅颜色值，自动包装为 color: #4dabf7
 *   // style: 'color: #4dabf7; font-weight: bold',  // 或传完整 CSS
 *   timeFlag: true,
 * }))
 *
 * // biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
 * interface AppService extends DebuggableTrait<AppSettings> {}
 *
 * const svc = new AppService()
 * svc.setDebug({ debug: false, http: true })
 * svc.debug('http', 'request sent', { url: '/api/users' })  // 输出
 * svc.debug('ws', 'connected')                               // 静默
 * ```
 */
export const debuggable = <Settings extends DebugSettings = DebugSettings>(
  config: Partial<DebugConfiguration>,
): DebuggableTrait<Settings> => {
  const debugFn = (method?: DebugConfiguration['method']): DebugFunction =>
    typeof method === 'function' ? method : console[method ?? 'log'];

  const getTimeFlag = (flag?: DebugConfiguration['timeFlag']) =>
    typeof flag === 'function' ? flag() : flag ? debugTimeFlag() : '';

  const getHeads = (
    format: DebugConfiguration['format'],
    vars: Record<string, string | null | undefined>,
    styles: Record<string, string | null | undefined>,
  ) => {
    if (typeof format === 'function') return format(vars, styles);
    const tails: string[] = [];
    const heads: string[] = [];
    for (const key of Object.keys(vars)) {
      const val = vars[key];
      if (!val) continue;
      if (styles[key]) {
        heads.push(`%c${val}`);
        tails.push(styles[key] as string);
      } else {
        heads.push(val);
      }
    }

    const head = heads.join(' ');
    if (!head) return [];
    if (tails.length > 0) {
      return [head, ...tails];
    }
    return [head];
  };

  return {
    debugConfig: {
      name: 'Debug',
      ...config,
    },

    setDebug(debug?: boolean | Partial<Settings>) {
      if (debug != null) {
        this.debugSettings = {
          ...(this.debugSettings ?? {}),
          ...(typeof debug === 'boolean' ? { debug } : debug),
        } as Partial<Settings>;
      }
      return this;
    },

    shouldDebug(
      scope?: keyof Omit<Settings, 'debug'> | string | undefined | null,
    ) {
      const settings = this.debugSettings;
      let isDebug = !!settings?.debug;
      if (!notEmptyString(scope)) return isDebug;
      const dotIndex = scope.indexOf('.');
      const ns = dotIndex > -1 ? scope.slice(0, dotIndex) : scope;
      if (ns !== scope) {
        if (settings?.[scope] != null) {
          isDebug = Boolean(settings[scope]);
        } else if (settings?.[ns] != null) {
          isDebug = Boolean(settings[ns]);
        }
      } else {
        if (settings?.[scope] != null) {
          isDebug = Boolean(settings[scope]);
        }
      }
      return isDebug;
    },

    debug(
      scope: keyof Omit<Settings, 'debug'> | string | undefined | null,
      ...args: unknown[]
    ) {
      if (!this.shouldDebug(scope)) return this;
      const {
        name,
        timeFlag,
        method,
        color,
        style,
        scopeColor,
        scopeStyle,
        format,
      } = this.debugConfig ?? {};

      const fn = debugFn(method);
      const flag = getTimeFlag(timeFlag);
      const vars = { flag, name, scope: scope as string };
      const styles = {
        flag: 'color: gray',
        name: style ? style : color ? `color: ${color}` : undefined,
        scope: scopeStyle
          ? scopeStyle
          : scopeColor
            ? `color: ${scopeColor}`
            : undefined,
      };

      fn(...getHeads(format, vars, styles), ...args);
      return this;
    },

    getStack(skipFrames = 0) {
      const err = new Error();
      const lines = (err.stack ?? '').split('\n');
      // 第一行是 "Error" 自身，跳过；skipFrames 让调用方排除自己的 wrapper 帧
      return lines.slice(1 + Math.max(0, skipFrames | 0)).map((l) => l.trim());
    },
  };
};
