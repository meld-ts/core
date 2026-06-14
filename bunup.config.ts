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
  ],
  name: 'core',
  format: ['esm', 'cjs'],
  target: 'node',
  outDir: './dist',
  sourcemap: 'linked',
}) as DefineConfigItem;
