/**
 * a11y 子路径入口：类型机器 + createA11y 运行时。
 *
 * 不导出任何预绑定的 a11y 实例；使用方在项目里用 createA11y
 * 绑定自己的 lint 与 output。
 *
 * 导出只做星号汇总，不逐个列举：不想对外暴露的符号放进 `_` 开头的
 * 文件（`_internal.ts`），它们不会被这里的星号带上。
 */
export * from './createA11y';
export * from './aria.generated';
export * from './lints';
export * from './types';
