import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

/**
 * Nap `.env` (o goc repo) NGAY KHI MODULE NAY DUOC IMPORT.
 *
 * Truoc day vong lap nay nam trong THAN cua `main.ts`, tuc chay SAU khi `import { AppModule }`
 * da thuc thi xong. Nhung `AppModule` keo theo `knowledge/seed.ts`, ma file do goi
 * `loadTenantKnowledge()` ngay luc import — nen no doc `process.env.TENANT` truoc khi dotenv kip
 * chay. Ke tu khi `TENANT` het gia tri mac dinh (Dot B1), hau qua la `pnpm dev:api` KHONG boot
 * duoc bang `.env` nua, du `.env.example` van huong dan dat TENANT o do.
 *
 * Tach thanh module rieng va import DAU TIEN trong `main.ts`: ESM chay cac import theo dung thu
 * tu khai bao, nen dotenv xong truoc khi bat ky module nghiep vu nao duoc nap.
 */
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}
