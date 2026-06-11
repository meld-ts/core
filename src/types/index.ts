/**
 * 类 Error 结构：包含 `message` 或 `error` 字段的对象
 *
 * 用于 `isErrorLike` 的类型收窄目标。两个字段均为可选，
 * 但 `isErrorLike` 保证收窄后至少其一为非空字符串。
 *
 * @see {@link isErrorLike} 类型守卫
 */
export type ErrorLike = {
  message?: string;
  error?: string;
};

/**
 * 可 `new` 调用的构造函数类型
 *
 * @example
 * ```ts
 * function create<T>(ctor: Constructor<T>): T {
 *   return new ctor();
 * }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: constructor args are intentionally open
export type Constructor<T = object> = new (...args: any[]) => T;

/**
 * 类型守卫函数类型
 *
 * `(val: unknown) => val is T` — TypeScript 类型谓词签名。
 * 守卫通过后，调用点的 `val` 被收窄为 `T`。
 */
export type TypeGuard<T = unknown> = (val: unknown) => val is T;

/**
 * 从 TypeGuard 提取被守卫的类型
 *
 * 条件类型：若 `G` 为 `TypeGuard<T>`，则提取 `T`；否则为 `never`。
 * 对联合类型自动分布，得到各分支的联合——这正是 `or()` 返回类型所需。
 *
 * @example
 * ```ts
 * type T = InferGuard<typeof isString>;  // string
 * type U = InferGuard<typeof isString | typeof isNumber>;  // string | number
 * ```
 */
export type InferGuard<G> = G extends TypeGuard<infer T> ? T : never;

/**
 * 任意函数类型（同步/异步皆可）
 *
 * 作为 `isFunction` 的泛型约束基类型。返回值 `any` 覆盖 `void`、`Promise<T>` 等所有情况。
 *
 * @see {@link isFunction} 泛型收窄用法
 */
// biome-ignore lint/suspicious/noExplicitAny: base type for generic inference
export type AnyFunction = (...args: any[]) => any;
