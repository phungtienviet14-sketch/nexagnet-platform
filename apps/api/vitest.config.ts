import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // NestJS dung decorator metadata cho DI - esbuild mac dinh cua Vitest
    // khong emit metadata nen phai transform bang SWC (doc .swcrc).
    swc.vite(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
