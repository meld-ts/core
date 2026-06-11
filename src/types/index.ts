/**
 * 可能是一个包含错误消息的结构
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
 */
export type TypeGuard<T = unknown> = (val: unknown) => val is T;

/**
 * 从 TypeGuard 提取被守卫的类型
 */
export type InferGuard<G> = G extends TypeGuard<infer T> ? T : never;

/**
 * with 原型链
 */
export type WithPrototype = {
  prototype: unknown;
};
