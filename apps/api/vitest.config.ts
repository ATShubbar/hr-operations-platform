import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
