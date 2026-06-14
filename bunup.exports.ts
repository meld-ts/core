import { type DefineConfigItem, defineConfig } from 'bunup';
import config from './bunup.config';

export default defineConfig({
  ...config,
  sourcemap: false,
  clean: true,
  exports: true,
}) as DefineConfigItem;
