/**
 * DIEM VAO CUA PRELOAD — nap bang `node --import <file>`, KHONG phai bang mot `import` nao trong
 * code nghiep vu.
 *
 *   NODE_OPTIONS="--import ./dist/observability/otel/otel-preload.js" node dist/main.js
 *
 * ---------------------------------------------------------------------------
 * VI SAO PRELOAD TU NAP DOTENV:
 *
 * Preload chay TRUOC `main.ts`, nen no cung chay truoc `config/load-dotenv.js` cua ung dung.
 * Neu khong tu nap `.env` thi `OTEL_TRACING` phai duoc dat o moi truong tien trinh — dung o
 * production (bien do compose truyen vao) nhung sai o may lap trinh vien, noi moi cau hinh nam
 * trong `.env`. Nap o day la NAP LAI mot file idempotent: `dotenv` khong ghi de bien da co, nen
 * lan goi thu hai trong `main.ts` khong doi gi.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG CO GI KHAC O DAY:
 *
 * Preload la doan code chay som nhat trong tien trinh. Moi thu no keo theo se duoc nap TRUOC khi
 * instrumentation kip va lai module — tuc keo nham mot thu se lam hong chinh viec ma preload ton
 * tai de lam. Nen o day chi co: dotenv, `startOtel`, va hai hook tat may.
 */
import '../../config/load-dotenv.js';
import { shutdownOtel, startOtel } from './otel-runtime.js';

const enabled = startOtel();

if (enabled) {
  // Day not hang doi truoc khi tien trinh tat. `once` de hai tin hieu lien tiep khong goi hai lan.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdownOtel();
    });
  }
  // `beforeExit` bat ca duong thoat BINH THUONG (event loop can) — duong ma SIGTERM khong bat.
  process.once('beforeExit', () => {
    void shutdownOtel();
  });
  console.log('[otel] runtime tracing dang bat');
}
