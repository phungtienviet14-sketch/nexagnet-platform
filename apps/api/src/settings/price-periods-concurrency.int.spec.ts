import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { PricePeriodsService } from './price-periods.service.js';

/**
 * VONG DOI KY GIA DUOI HAI NGUOI GHI CHONG NHAU — tren Postgres THAT (Issue #121).
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI TUAN TU KHONG DU (va vi sao tep nay ton tai):
 *
 * `price-periods.service.spec.ts` da chung minh `removeDraftPrice` TU CHOI mot ky `active` va mot
 * ky `archived`. Dung — nhung no chi tra loi duoc cau hoi "neu trang thai DA la active thi sao",
 * chu khong tra loi duoc cau hoi that:
 *
 *     T1 removeDraftPrice doc  status=draft
 *     T2 activate         commit status=active
 *     T1 deleteMany            -> xoa mot SKU khoi ky DA ACTIVE
 *
 * Do la mot `check-then-act` khong nguyen tu. No khong lo ra o duong tuan tu, va no pha dung cai
 * bat bien ma #116/#117 dung len: dong gia cua ky ACTIVE/ARCHIVED la su that da chot.
 *
 * MOT `$transaction` THUONG CUNG KHONG DU: Postgres mac dinh `READ COMMITTED`, nen hai giao dich
 * van doc duoc cung mot anh chup cu roi ca hai cung ghi. Phai co khoa hang (`FOR UPDATE`).
 *
 * ---------------------------------------------------------------------------
 * CACH DUNG LEN MOT CUOC DUA LAP LAI DUOC:
 *
 * `Promise.all([...])` khong dam bao xen ke — no co the xanh nguyen nhom chi vi may nhanh, va mot
 * bai nhu vay khong chung minh duoc gi. Nen o day cuoc dua duoc DUNG LEN, khong pho mac may:
 *
 *   1. mot phien RIENG mo giao dich va giu `SELECT ... FOR UPDATE` tren dung hang ky;
 *   2. `removeDraftPrice` duoc goi — ban DA SUA se CHAN o dung cho lay khoa;
 *   3. phien kia doi trang thai (active/archived) roi commit;
 *   4. `removeDraftPrice` tinh day, doc LAI trang thai moi, va tu choi.
 *
 * Tren ban CHUA SUA buoc 2 khong chan gi ca: no doc `draft`, xoa dong ngay, roi buoc 3 moi bien
 * ky thanh active — ket qua la mot ky ACTIVE thieu SKU. Vi vay hai bai dau duoi day DO tren ma
 * cua PR #118 truoc ban va, va XANH sau ban va.
 *
 * ---------------------------------------------------------------------------
 * CHAY: can Postgres that (`RUN_PRISMA_IT=1`), giong cac `*.int.spec.ts` khac:
 *   RUN_PRISMA_IT=1 DATABASE_URL=postgresql://netviet:netviet_local@127.0.0.1:5432/netviet \
 *     pnpm --filter @netviet/api exec vitest run src/settings/price-periods-concurrency.int.spec.ts
 */

const RUN_IT = process.env.RUN_PRISMA_IT === '1';

// Tien to KHONG duoc long vao tien to cua bo khac (don dep dung `startsWith`).
const PREFIX = 'IT121-';
const SKU_A = `${PREFIX}A`;
const SKU_B = `${PREFIX}B`;
const FIXTURE_NOTE = `${PREFIX}race`;
// Thang o tuong lai xa: khong bao gio la `currentPriceMonth()`, nen bo nay khong the bien thanh
// "bang gia dang chay" cua bat ky bai nao khac.
const MONTH = '2099-01';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!RUN_IT)(
  'PricePeriod lifecycle duoi hai nguoi ghi CHONG NHAU (Postgres that)',
  () => {
    const prisma = new PrismaService();
    // Phien THU HAI: khoa hang chi co nghia khi no duoc giu o mot ket noi KHAC.
    const other = new PrismaService();
    const audited: string[] = [];
    const audit = {
      append: async (command: { action: string }) => {
        audited.push(command.action);
        return undefined as never;
      },
    } as unknown as AuditLogService;
    const knowledge = { reload: async () => undefined } as unknown as KnowledgeService;
    const service = new PricePeriodsService(prisma, audit, knowledge, 'prisma');

    async function cleanup() {
      await prisma.pricePeriod.deleteMany({ where: { note: FIXTURE_NOTE } });
      await prisma.price.deleteMany({ where: { sku: { startsWith: PREFIX } } });
      await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
    }

    async function seedProducts() {
      await prisma.product.createMany({
        data: [
          { sku: SKU_A, name: 'Fixture A', unit: 'cai' },
          { sku: SKU_B, name: 'Fixture B', unit: 'cai' },
        ],
        skipDuplicates: true,
      });
    }

    /**
     * Mot ban nhap co gia cho MOI mat hang trong danh muc.
     *
     * Phai la moi mat hang chu khong phai vai mat hang cua rieng bo nay: `activate()` doi du gia
     * cho toan danh muc, nen chi khi ban nhap day du thi viec "xoa mot dong roi activate" moi tro
     * thanh mot phep thu that — no bien ban nhap tu HOP LE thanh KHONG HOP LE.
     */
    async function seedFullDraft() {
      const products = await prisma.product.findMany({ select: { sku: true } });
      return prisma.pricePeriod.create({
        data: {
          validMonth: MONTH,
          status: 'draft',
          source: 'operator',
          note: FIXTURE_NOTE,
          createdBy: `${PREFIX}operator`,
          prices: { create: products.map((product) => ({ sku: product.sku, wholesale: 1_000 })) },
        },
        include: { prices: true },
      });
    }

    /**
     * Giu khoa hang ky o phien `other`, cho ben goi lam viec cua ho, roi doi trang thai va commit.
     *
     * `timeout` rong vi giao dich nay CO Y song lau hon binh thuong; `maxWait` la thoi gian cho
     * lay ket noi tu pool, khong lien quan toi cho khoa.
     */
    function holdPeriodLock(periodId: string, nextStatus: 'active' | 'archived') {
      const locked = deferred();
      const release = deferred();
      const done = other.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT "id" FROM "PricePeriod" WHERE "id" = ${periodId} FOR UPDATE`;
          locked.resolve();
          await release.promise;
          await tx.pricePeriod.update({
            where: { id: periodId },
            data: {
              status: nextStatus,
              ...(nextStatus === 'active' ? { activatedAt: new Date() } : {}),
            },
          });
        },
        { timeout: 30_000, maxWait: 30_000 },
      );
      return { locked: locked.promise, release: release.resolve, done };
    }

    beforeEach(async () => {
      audited.length = 0;
      await cleanup();
      await seedProducts();
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
      await other.$disconnect();
    });

    it('remove vs activate: activate thang -> remove bi tu choi, KHONG xoa khoi ky ACTIVE', async () => {
      const period = await seedFullDraft();
      const before = period.prices.length;

      const lock = holdPeriodLock(period.id, 'active');
      await lock.locked;

      // Ban da sua: lenh nay CHAN o `FOR UPDATE`. Ban chua sua: no doc `draft` roi xoa ngay.
      const removal = service
        .removeDraftPrice(period.id, SKU_A, 'operator', 'req-race-activate')
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));

      await sleep(500);
      lock.release();
      await lock.done;

      const outcome = await removal;

      // (1) Remove phai THUA, va thua co ly do — khong duoc im lang bo qua.
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error).toBeInstanceOf(ConflictException);

      // (2) KHANG DINH CHINH: ky da ACTIVE va KHONG mat dong nao.
      const after = await prisma.pricePeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { prices: true },
      });
      expect(after.status).toBe('active');
      expect(after.prices).toHaveLength(before);
      expect(after.prices.map((row) => row.sku)).toContain(SKU_A);

      // (3) Khong duoc ghi audit cho mot viec chua he xay ra.
      expect(audited).not.toContain('price_period.price.remove');
    });

    it('remove vs archive: archive thang -> remove bi tu choi, KHONG xoa khoi ky ARCHIVED', async () => {
      const period = await seedFullDraft();
      const before = period.prices.length;

      const lock = holdPeriodLock(period.id, 'archived');
      await lock.locked;

      const removal = service
        .removeDraftPrice(period.id, SKU_A, 'operator', 'req-race-archive')
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));

      await sleep(500);
      lock.release();
      await lock.done;

      const outcome = await removal;

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error).toBeInstanceOf(ConflictException);

      const after = await prisma.pricePeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { prices: true },
      });
      expect(after.status).toBe('archived');
      expect(after.prices).toHaveLength(before);
      expect(after.prices.map((row) => row.sku)).toContain(SKU_A);
      expect(audited).not.toContain('price_period.price.remove');
    });

    it('applyImport vs activate: activate thang -> import bi tu choi, KHONG ghi de gia ky ACTIVE', async () => {
      // CUA THU HAI VAO CUNG MOT BAT BIEN. `#121` goi ten ba nguoi ghi, nhung `applyImport` mac
      // dung cai bay do: `previewImport()` doc va kiem `draft`, roi cac lenh `upsert` chay o mot
      // giao dich KHAC. Sua `removeDraftPrice` ma bo qua day thi bat bien van thung.
      const period = await seedFullDraft();
      const original = period.prices.find((row) => row.sku === SKU_A)?.wholesale;
      expect(original).toBe(1_000);

      const lock = holdPeriodLock(period.id, 'active');
      await lock.locked;

      const applied = service
        .applyImport(
          period.id,
          { rows: [{ sku: SKU_A, wholesale: 999_999 }], overwrite: true, confirmed: true },
          'operator',
          'req-race-import',
        )
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));

      await sleep(500);
      lock.release();
      await lock.done;

      const outcome = await applied;

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error).toBeInstanceOf(ConflictException);

      // Gia cua ky DA ACTIVE khong duoc doi mot dong nao.
      const after = await prisma.price.findFirstOrThrow({
        where: { periodId: period.id, sku: SKU_A },
      });
      expect(after.wholesale).toBe(1_000);
      expect(audited).not.toContain('price_period.import.apply');
    });

    it('remove thang truoc -> activate cham diem tren dong SAU KHI XOA, khong dung anh chup cu', async () => {
      const period = await seedFullDraft();

      // Xoa xong han roi moi activate: ban nhap gio THIEU mot SKU cua danh muc.
      await service.removeDraftPrice(period.id, SKU_A, 'operator', 'req-remove-first');

      // Neu activate con doc anh chup truoc khi xoa, no se thay du gia va activate NHAM mot ky
      // thieu hang. Doc dung dong hien tai thi no phai tu choi.
      await expect(
        service.activate(period.id, 'operator', 'req-activate-after'),
      ).rejects.toBeInstanceOf(BadRequestException);

      const after = await prisma.pricePeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { prices: true },
      });
      expect(after.status).toBe('draft');
      expect(after.prices.map((row) => row.sku)).not.toContain(SKU_A);
    });

    it('remove lap lai van la 404 that tha, khong phai 500', async () => {
      const period = await seedFullDraft();

      await service.removeDraftPrice(period.id, SKU_A, 'operator', null);

      const second = await service
        .removeDraftPrice(period.id, SKU_A, 'operator', null)
        .then(() => null)
        .catch((error: unknown) => error);

      // 404, khong phai `PrismaClientKnownRequestError` P2025 noi len thanh 500.
      expect((second as { status?: number } | null)?.status).toBe(404);
    });

    it('hai remove CHONG NHAU tren cung SKU -> dung MOT ben xoa duoc, ben kia 404', async () => {
      const period = await seedFullDraft();

      const results = await Promise.all([
        service
          .removeDraftPrice(period.id, SKU_A, 'operator', null)
          .then(() => 'removed')
          .catch((error: { status?: number }) => `rejected:${error?.status}`),
        service
          .removeDraftPrice(period.id, SKU_A, 'operator', null)
          .then(() => 'removed')
          .catch((error: { status?: number }) => `rejected:${error?.status}`),
      ]);

      expect(results.filter((value) => value === 'removed')).toHaveLength(1);
      expect(results.filter((value) => value === 'rejected:404')).toHaveLength(1);
    });

    it('duoi tranh chap that (khong dung khoa tay), ky ACTIVE khong bao gio mat dong', async () => {
      // Bai nay khong dung len thu tu nao ca — no lap lai cuoc dua that nhieu lan va doi BAT BIEN
      // luon dung, du ai thang. Bo sung cho hai bai dung-thu-tu o tren, khong thay the chung.
      for (let round = 0; round < 5; round += 1) {
        await cleanup();
        await seedProducts();
        const period = await seedFullDraft();
        const total = period.prices.length;

        const [removal] = await Promise.all([
          service
            .removeDraftPrice(period.id, SKU_A, 'operator', null)
            .then(() => 'removed')
            .catch(() => 'rejected'),
          service
            .activate(period.id, 'operator', null)
            .then(() => 'activated')
            .catch(() => 'rejected'),
        ]);

        const after = await prisma.pricePeriod.findUniqueOrThrow({
          where: { id: period.id },
          include: { prices: true },
        });

        if (after.status === 'active') {
          // Ky da chot: KHONG duoc thieu dong nao, bat ke `removeDraftPrice` chay luc nao.
          expect(after.prices).toHaveLength(total);
          expect(after.prices.map((row) => row.sku)).toContain(SKU_A);
          expect(removal).toBe('rejected');
        } else {
          // Remove thang: ky con la nhap, va dong da bien mat mot cach hop le.
          expect(after.status).toBe('draft');
          expect(after.prices).toHaveLength(total - 1);
        }
      }
    });
  },
);
