import { defineConfig } from 'bunup';

export default defineConfig([
  {
    entry: 'src/browser/index.ts',
    name: 'browser-esm',
    format: 'esm',
    target: 'browser',
    outDir: './browser',
    sourcemap: 'linked',
    dts: true,
    clean: false,
  },
  {
    entry: 'src/browser/iife.ts',
    name: 'browser-iife',
    format: 'iife',
    target: 'browser',
    outDir: './browser',
    sourcemap: 'linked',
    dts: false,
    clean: false,
  },
]) as ReturnType<typeof defineConfig>;
