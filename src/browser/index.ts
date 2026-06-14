/**
 * Browser 全量入口
 *
 * - 输出 iife 和 esm 两种格式
 * - target 为 browser
 *
 * 打包为 `browser/index.js`（ESM）和 `browser/index.global.js`（iife），
 * iife 通过 `<script>` 引入后，全局变量 `MeldTS` 提供所有模块导出。
 */
/** biome-ignore-all assist/source/organizeImports: 手动维护导出排序 */
export * from '../types';
export * from '../base';
export * from '../guards';
export * from '../timer';
export * from '../singleton';
export * from '../path';
export * from '../traits';
export * from '../events';
export * from '../async';
