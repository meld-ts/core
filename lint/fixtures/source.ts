// 被引用的源模块（合法文件，无违规）。夹具都在 lint/fixtures/ 下的独立嵌套配置里跑，
// 见 lint/no-cross-file-reexport.test.ts。
export const isString = (v: unknown): v is string => typeof v === 'string';
export const isNumber = (v: unknown): v is number => typeof v === 'number';
export type RetryOptions = { retries: number };
export type SessionOptions = { token: string };
export interface Wrapper<T> { value: T }
export default isString;
