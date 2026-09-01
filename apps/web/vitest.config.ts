import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'experiences/**/*.{test,spec}.ts',
      // Phan quyet dinh cua man cai dat (muc nao hien, ai duoc sua) nam trong `components/settings`
      // duoi dang module `.ts` thuan — khong co JSX nen chay duoc o moi truong node.
      'components/**/*.test.ts',
    ],
  },
});
