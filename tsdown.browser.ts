import { type UserConfig, defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/browser/index.ts'],
    format: 'esm',
    platform: 'browser',
    outDir: './browser',
    dts: true,
    sourcemap: true,
    fixedExtension: false,
  },
  {
    entry: ['src/browser/iife.ts'],
    format: 'iife',
    platform: 'browser',
    outDir: './browser',
    dts: false,
    sourcemap: true,
    // 网页 <script> 引用方依赖这个文件名，沿用 bunup 时代的 iife.global.js
    outputOptions: {
      entryFileNames: 'iife.global.js',
    },
  },
]) as UserConfig[];
