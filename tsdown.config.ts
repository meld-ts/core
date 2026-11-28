import { type UserConfig, defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/timer.ts',
    'src/singleton.ts',
    'src/path.ts',
    'src/traits/index.ts',
    'src/events/index.ts',
    'src/async/index.ts',
    'src/a11y/index.ts',
  ],
  format: ['esm', 'cjs'],
  platform: 'node',
  outDir: './dist',
  dts: true,
  sourcemap: true,
  // type:module 下 ESM 用 .js（而非 .mjs），CJS 用 .cjs
  fixedExtension: false,
  exports: true,
  // isolatedDeclarations 下 default export 必须显式类型
}) as UserConfig;
