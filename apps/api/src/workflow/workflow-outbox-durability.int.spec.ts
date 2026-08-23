import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import {
  CRASH_WINDOW_CHAT_ID,
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  baseEnv,
  bootAppContext,
  countEngineRuns,
  runCrashWindowChild,
  waitFor,
  type BootedApp,
} from './__tests__/workflow-it.harness.js';

/**
 * W4 — CUA SO SUP CUA OUTBOX, tren POSTGRES THAT.
 *
 * ---------------------------------------------------------------------------
 * CAU HOI BAI NAY TRA LOI, va no la cau hoi dat nhat cua ca tang ban giao:
 *
 *   "Neu tien trinh chet DUNG SAU khi don da commit nhung TRUOC khi engine biet gi,
 *    thi su kien do con hay mat?"
 *
 * Moi thiet ke "commit xong roi goi engine" deu co cua so nay, va no khong thu nho ve 0 duoc.
 * Cach duy nhat de dong no la ghi hang outbox TRONG CUNG giao dich voi thay doi nghiep vu.
 *
 * ---------------------------------------------------------------------------
 * BAT BUOC `PERSISTENCE=prisma` + Postgres THAT. Khong duoc dung ban trong bo nho:
 *
 *   `InMemoryWorkflowOutboxRepository` giu hang trong mot `Map` cua CHINH tien trinh do. Tien
 *   trinh chet -> `Map` chet theo. Mot bai "chung minh do ben" chay tren no se do dung mot thu:
 *   rang bo nho con song khi tien trinh con song. Vo nghia.
 *
 * Bai duoi day FAIL neu outbox nam trong bo nho, vi khang dinh cuoi doc hang tu Postgres bang
 * MOT tien trinh KHAC voi tien trinh da ghi.
 *
 * DA KIEM CHUNG DIEU DO, khong phai chi tuyen bo (23/08/2026): chay lai chinh file nay voi
 * `PERSISTENCE=memory` thi
 *
 *   bai ② "CHET SAU COMMIT"   -> DO  `expected null not to be null` (khong co hang trong Postgres)
 *   bai ③ "traceId 4 lop"      -> DO  `Cannot read properties of null (reading 'traceId')`
 *   bai ① "CHET TRUOC COMMIT"  -> van XANH
 *
 * Bai ① van xanh la DUNG va can noi ro: no khong do do ben, no do mot thu khac —
 * "hang outbox co THOAT RA NGOAI giao dich khong". Neu `enqueue` bo qua `tx` va ghi doc lap,
 * don se rollback con hang thi o lai, va luc do bai ① do. Hai bai, hai che do hong.
 *
 *   docker compose -f docker-compose.yml up -d postgres
 *   pnpm --filter @netviet/api exec prisma migrate deploy
 *   docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
 *   RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=… \
 *     pnpm --filter @netviet/api exec vitest run src/workflow/workflow-outbox-durability
 */

const ENGINE_WORKFLOW_NAME = 'integration-handoff.v1';

describe.runIf(process.env.RUN_PRISMA_IT === '1' && process.env.RUN_WORKFLOW_IT === '1')(
  'W4 — outbox giao dich: cua so sup, tren Postgres THAT',
  () => {
    const endpoint = new ProofEndpoint();
    const prisma = new PrismaService();
    let worker: WorkerProcess;
    let recovered: BootedApp | undefined;
    let childEnv: NodeJS.ProcessEnv;
    let endpointPort = 0;

    async function cleanup(): Promise<void> {
      const orders = await prisma.order.findMany({
        where: { chatId: CRASH_WINDOW_CHAT_ID },
        select: { id: true },
      });
      const ids = orders.map((o) => o.id);
      if (ids.length > 0) {
        await prisma.workflowOutbox.deleteMany({ where: { entityId: { in: ids } } });
        await prisma.order.deleteMany({ where: { id: { in: ids } } });
      }
    }

    beforeAll(async () => {
      endpointPort = await endpoint.listen();
      // `PERSISTENCE=prisma` la diem mau chot cua ca file nay, khong phai mot chi tiet cau hinh.
      childEnv = baseEnv(WORKFLOW_FIXTURE, endpointPort, { PERSISTENCE: 'prisma' });

      await cleanup();

      // Worker song suot bai: no khong lien quan toi cua so sup, nhung buoc HOI PHUC can no de
      // chung minh su kien khong chi "con trong bang" ma con "chay den noi den chon".
      worker = new WorkerProcess('v1', childEnv);
      await worker.start();
    }, 240_000);

    afterAll(async () => {
      await recovered?.context.close();
      await worker?.stop();
      await endpoint.close();
      await cleanup();
      await prisma.$disconnect();
    }, 90_000);

    // ------------------------------------------------------------------ 6.2

    it('CHET TRUOC COMMIT -> ca don lan hang outbox deu KHONG ton tai', async () => {
      const before = await prisma.workflowOutbox.count();

      const child = await runCrashWindowChild(['--abort-before-commit'], childEnv);
      expect(child.outcome).toBe('ROLLED_BACK');

      // Tien trinh con DA ghi ca hai truoc khi nem — nen neu rollback khong bao trum ca hai,
      // mot trong hai se con lai o day. Day la toan bo phep do.
      const order = await prisma.order.findUnique({ where: { id: child.orderId } });
      expect(order).toBeNull();

      const row = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      expect(row).toBeNull();

      // Va khong hang la nao xuat hien: khang dinh nay bat truong hop `enqueue` lang le ghi
      // NGOAI `tx` voi mot khoa khac.
      expect(await prisma.workflowOutbox.count()).toBe(before);

      // Engine khong duoc biet gi ve mot thao tac chua bao gio ton tai.
      expect(await countEngineRuns(ENGINE_WORKFLOW_NAME, 'nexagnet.entityId', child.orderId)).toBe(
        0,
      );
    }, 180_000);

    // ------------------------------------------------------------------ 6.1

    it('CHET SAU COMMIT, TRUOC ENGINE -> ca hai CON, engine chua co run, roi HOI PHUC gui tiep', async () => {
      const child = await runCrashWindowChild([], childEnv);
      expect(child.outcome).toBe('COMMITTED');
      expect(child.orderId).not.toBe('');
      expect(child.operationKey).not.toBe('');

      // ① TRANG THAI NGHIEP VU con — doc bang mot ket noi KHAC, o mot tien trinh KHAC.
      const order = await prisma.order.findUnique({ where: { id: child.orderId } });
      expect(order?.chatId).toBe(CRASH_WINDOW_CHAT_ID);

      // ② HANG OUTBOX con, va con o dung trang thai "chua ai dong toi".
      //    `attempts === 0` la khang dinh do CUA SO: neu dispatcher cua tien trinh con kip nhan
      //    hang truoc khi chet thi con so nay la 1, va bai nay DO — trung thuc, khong xanh gia.
      const row = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      expect(row).not.toBeNull();
      expect(row!.status).toBe('pending');
      expect(row!.attempts).toBe(0);
      expect(row!.engineRunId).toBeNull();
      expect(row!.entityId).toBe(child.orderId);
      // Phien ban duoc GHIM luc xep hang, khong doc lai luc gui.
      expect(row!.workflowVersion).toBe('v1');

      // ③ HE NGOAI chua nhan gi — su kien chua di dau ca.
      expect(endpoint.postsFor(child.operationKey)).toBe(0);

      // ④ ENGINE chua co run nao. Day la khang dinh chi doc duoc tu PHIA ENGINE; khong co no
      //    thi "chua goi engine" van chi la mot gia dinh cua ta ve chinh code cua ta.
      expect(await countEngineRuns(ENGINE_WORKFLOW_NAME, 'nexagnet.entityId', child.orderId)).toBe(
        0,
      );

      // ⑤ HOI PHUC: mot tien trinh Nexagnet MOI len — dung `AppModule` that, dung Postgres do.
      //    Khong goi dispatcher bang tay: `WorkflowScheduler` that tu danh thuc no.
      recovered = await bootAppContext(childEnv);

      await waitFor(
        () => endpoint.postsFor(child.operationKey) >= 1,
        RUN_COMPLETE_TIMEOUT_MS,
        () => `su kien khong duoc gui tiep sau khi khoi dong lai — DA MAT`,
      );

      // ⑥ Va no di TRON chuoi: dung khoa, dung soi trace, dung hop dong dau vao.
      const call = endpoint.callsFor(child.operationKey)[0]!;
      expect(call.idempotencyKey).toBe(child.operationKey);
      expect(call.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      expect(call.body.entityId).toBe(child.orderId);

      // ⑦ Hang chuyen trang thai va mang tham chieu sang lan chay ben engine.
      await waitFor(
        async () =>
          (await prisma.workflowOutbox.findUnique({ where: { operationKey: child.operationKey } }))
            ?.status === 'dispatched',
        RUN_COMPLETE_TIMEOUT_MS,
        () => `hang outbox khong chuyen sang 'dispatched'`,
      );
      const settled = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      expect(settled!.engineRunId).not.toBeNull();
      expect(settled!.attempts).toBe(1);

      // ⑧ MOT su kien -> MOT tac dung phu. Khong nhan doi qua mot lan sup tien trinh.
      expect(endpoint.appliedFor(child.operationKey)).toBe(true);
      expect(endpoint.postsFor(child.operationKey)).toBe(1);
    }, 240_000);

    // -------------------------------------------------- tuong quan trace 4 lop

    it('CUNG MOT traceId di xuyen 4 lop — gia tri that, khong phai khuon regex', async () => {
      const child = await runCrashWindowChild([], childEnv);
      expect(child.outcome).toBe('COMMITTED');

      // ① lop Nexagnet: hang outbox trong Postgres.
      const row = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      const outboxTraceId = row!.traceId;
      // Ngoai mot trace bao quanh, cau noi PHAI sinh mot traceId moi va ghi CHINH no vao hang.
      // Day la hoi quy cua loi da sua o `1e213c8`: truoc do hang mang `null`, nen ban ghi ben
      // Nexagnet va lan chay ben engine khong bao gio noi lai duoc.
      expect(outboxTraceId).toMatch(/^[0-9a-f]{32}$/);

      // ② lop metadata gui sang engine — doc tu chinh hang (day la thu se di sang engine).
      const metadata = row!.metadata as Record<string, string>;
      expect(metadata['nexagnet.traceId']).toBe(outboxTraceId);
      expect(metadata.traceparent!.split('-')[1]).toBe(outboxTraceId);

      recovered = recovered ?? (await bootAppContext(childEnv));
      await waitFor(
        () => endpoint.postsFor(child.operationKey) >= 1,
        RUN_COMPLETE_TIMEOUT_MS,
        () => `su kien khong toi duoc he ngoai`,
      );

      // ③ lop he ngoai: header `traceparent` ma worker gui di, sau khi di qua engine va worker.
      const call = endpoint.callsFor(child.operationKey)[0]!;
      expect(call.traceparent!.split('-')[1]).toBe(outboxTraceId);
    }, 240_000);
  },
);
