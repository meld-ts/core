/**
 * 内置 lint 规则表汇总。
 *
 * 一个 lint 一个文件；更新单个 lint 整文件覆盖。
 * 四张表均由探针独立生成（bun 表不 aliasOf eslint，内嵌 oxlint 独立探测）。
 * 公开面只有 `builtin.ts` 的 `A11yBuiltinLints`；四张表文件以 `_` 开头，不转发。
 */
export * from './builtin';
