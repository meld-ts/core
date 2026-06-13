import { defineConfig } from 'bunup';

export default defineConfig([
  {
    entry: [
      'src/browser.ts'
    ],
    name: 'core',
    format: ['esm', 'iife'],
    target: 'browser',
    outDir: './browser',
    sourcemap: 'linked',
    // minify: true,
    // exports: true,
  },
]);
