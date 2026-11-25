/**
 * probe 模块入口。
 *
 * 只做星号汇总：公开面由 `probe.ts` 决定，其余文件（detect、serialize、
 * 各类生成器）是内部实现，按需直接深导入，不经这个入口。
 */
export * from './probe';
