import { defineConfig } from 'bunup';

export default defineConfig([
  {
    entry: [
      // src root files
      'src/index.ts',
    ],
    name: 'core',
    format: ['esm', 'cjs'],
    target: 'node',
    outDir: './dist',
    sourcemap: 'linked',
    exports: true,
  },
]);
