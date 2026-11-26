import { type DefineConfigItem, defineConfig } from 'bunup';

export default defineConfig({
  entry: [
    // src root files
    'src/index.ts',
    'src/timer.ts',
    'src/singleton.ts',
    'src/path.ts',
    'src/traits/index.ts',
    'src/events/index.ts',
    'src/async/index.ts',
    'src/a11y/index.ts',
    'src/fetch/index.ts',
  ],
  // Bun 1.4.4 stops at the lowest common ancestor for most entry sets, but
  // with this nine-entry set it picks the package root and spills outputs to
  // dist/src/. Pin the base instead of relying on the inference.
  sourceBase: './src',
  name: 'core',
  format: ['esm', 'cjs'],
  target: 'node',
  outDir: './dist',
  sourcemap: 'linked',
}) as DefineConfigItem;
