import { defineConfig } from 'vitest/config';

/**
 * Chi chay logic THUAN (khong import `react-native`/`expo-*`): may khach HTTP, phan loai loi, hang
 * doi ngoai tuyen, view-model. Man hinh duoc chung minh bang ban dung web (Playwright) va bang
 * may ao Android tren CI — xem docs/phat-hanh.md.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
