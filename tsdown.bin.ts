import { type UserConfig, defineConfig } from 'tsdown';

// 独立于 tsdown.config.ts：主配置生成 exports 字段，
// bin 不是库子路径，混进主配置会产生 ./bin 导出
export default defineConfig({
  entry: ['bin/meld-ts.ts'],
  format: 'esm',
  platform: 'node',
  outDir: './dist/bin',
  dts: false,
  sourcemap: false,
  // bin 字段指向 dist/bin/meld-ts.js，保持 .js 而非 .mjs
  fixedExtension: false,
  banner: '#!/usr/bin/env bun',
}) as UserConfig;
