/**
 * Traits 模块
 *
 * 提供类似 PHP/Scala trait 的机制，对既有 class 进行原型链扩展，
 * 同时通过 interface 声明合并保证 TypeScript 类型签名完整。
 */
/** biome-ignore-all assist/source/organizeImports: 手动维护导出排序 */
export { implTraits } from './implTraits';
export * from './configurable';
export * from './debuggable';
