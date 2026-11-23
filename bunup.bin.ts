import { type DefineConfigItem, defineConfig } from 'bunup';

// 独立于 bunup.config.ts：bunup.exports.ts 会展开主配置生成 exports，
// bin 不是库子路径，混进主配置会产生 ./bin 导出
export default defineConfig({
  entry: 'src/bin/meld.ts',
  name: 'meld',
  format: ['esm'],
  target: 'node',
  outDir: './dist/bin',
  sourcemap: false,
  dts: false,
  banner: '#!/usr/bin/env bun',
}) as DefineConfigItem;
