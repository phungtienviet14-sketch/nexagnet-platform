import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import { TEST_ONLY_PRICE_PERIOD_SOURCE } from '../knowledge/domain.js';
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
 * TEP NAY GIU HAI TANG CUA CUNG MOT GIAO THUC:
 *   · #121 — hai nguoi ghi cham vao CUNG MOT hang ky (remove/import/activate/archive);
 *   · #122 — hai `activate` cua HAI ky KHAC NHAU nhung CUNG MOT `validMonth`.
 *
 * Hai nhom o chung mot tep CO Y: ca hai dung chung mot khong gian fixture (`IT121-`) va chung
 * mot danh muc san pham. `activate()` cua ky chinh thuc doi du gia cho TOAN danh muc, nen neu
 * tach ra hai tep thi vitest chay song song se cho nhom nay them SKU cua nhom kia giua chung —
 * bai se do vi mot ly do khong lien quan gi toi cuoc dua.
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
    /**
     * -----------------------------------------------------------------------------------------
     * BAT BIEN THEO THANG, khong con theo mot hang (Issue #122).
     *
     * Khoa hang cua #121 xep hang dung nhung nguoi ghi cham VAO CUNG MOT hang ky. Nhung
     * `activate()` con giu mot bat bien rong hon mot hang — no noi ve CA THANG:
     *
     *   INV1  moi thang chi duoc co MOT ky chinh thuc ACTIVE
     *   INV2  khong bao gio vua co ky chinh thuc ACTIVE vua co ky TEST-only ACTIVE cung thang
     *   INV3  moi thang chi duoc co MOT ky TEST-only ACTIVE
     *
     * Hai `activate()` cua HAI ban nhap KHAC NHAU khoa hai hang KHAC NHAU, nen khoa hang cua #121
     * khong he lam ho gap nhau. Ca hai deu kiem "thang nay dang co gi" tren mot anh chup CU roi
     * ca hai cung ghi — dung mau `check-then-act` ma #121 da dong o cap hang, nay ho lai o cap
     * thang.
     *
     * -----------------------------------------------------------------------------------------
     * PHAI NOI RO MOT DIEU: DATABASE DA CO SAN MOT LUOI, VA DO LA LUOI CUOI.
     *
     * `schema.prisma` khong khai rang buoc nao, nhung migration `20260812123000_price_periods`
     * (da nam tren `main`, va `prisma migrate deploy` cua CI co ap) co tao:
     *
     *     CREATE UNIQUE INDEX "PricePeriod_one_active_per_month"
     *       ON "PricePeriod"("validMonth") WHERE "status" = 'active' AND "validMonth" IS NOT NULL;
     *
     * Nghia la ba bat bien tren KHONG the bi pha thanh du lieu hong — Postgres chan o phut cuoi.
     * Cai hong la thu khac, va no hong that: ung dung KHONG he biet toi cai luoi do. Hai
     * `activate()` cung thang chay chong nhau thi ben thua khong nhan duoc cau tra loi nghiep vu
     * nao ca — no nhan `PrismaClientKnownRequestError` P2002 noi thang len thanh 500. Con phep
     * kiem "da co ky chinh thuc active chua" o trong `activate()` thi doc mot anh chup cu, nen no
     * chi la trang tri: ket qua that do INDEX quyet dinh, khong phai do phep kiem.
     *
     * Vi vay bai o day khong khang dinh "co hai ky ACTIVE" (index khong cho), ma khang dinh dung
     * cai dang hong: NGUOI VAN HANH PHAI NHAN DUOC MOT CAU TRA LOI THAT THA — dung yeu cau
     * nguyen van cua Issue #122 ("the loser must receive a truthful conflict/state outcome").
     *
     * -----------------------------------------------------------------------------------------
     * CACH DUNG LEN CUOC DUA — mot CUA CHAN nam GIUA "kiem" va "ghi".
     *
     * Cho hai ky nhap chay `Promise.all` thi khong chung minh duoc gi: may nhanh thi chung khong
     * chong nhau, va bai xanh vi may man. Nen cuoc dua o day duoc DUNG LEN bang mot cho chan co
     * that nam trong chinh duong ghi:
     *
     *   1. thang do da co san MOT ky ACTIVE (`gate`) — dung nhu thang that cua khach;
     *   2. mot phien RIENG giu `SELECT ... FOR UPDATE` tren hang `gate`;
     *   3. `activate()` cua ca hai ban nhap deu phai `UPDATE` hang `gate` (buoc luu tru ky cu),
     *      nen ca hai deu DUNG LAI o day — SAU khi da kiem, TRUOC khi kip ghi;
     *   4. tha `gate` ra: tren ma cu ca hai cung di tiep va cung ghi `active`; index bat mot ben,
     *      va ben do vo mat voi mot loi ha tang.
     */
    describe('BAT BIEN CUA CA THANG khi activate (Issue #122)', () => {
      /**
       * Giu khoa hang mot ky BAT KY ma KHONG doi trang thai no.
       *
       * Khac `holdPeriodLock` o tren: hang bi giu o day khong phai muc tieu cua ai ca — no la ky
       * dang chay cua thang, tuc la cai ma MOI `activate()` cung thang deu phai luu tru. Giu no
       * lai chinh la giu ca hai nguoi ghi o dung khe giua "kiem" va "ghi".
       */
      function holdRowLock(periodId: string) {
        const locked = deferred();
        const release = deferred();
        const done = other.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT "id" FROM "PricePeriod" WHERE "id" = ${periodId} FOR UPDATE`;
            locked.resolve();
            await release.promise;
          },
          { timeout: 30_000, maxWait: 30_000 },
        );
        return { locked: locked.promise, release: release.resolve, done };
      }

      type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };

      /** Chay mot lenh ma khong de loi lam do ca bai — ket qua duoc doc o phan khang dinh. */
      function attempt(run: () => Promise<unknown>): Promise<Outcome> {
        return run().then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        );
      }

      /**
       * Loi HA TANG ro ri ra ngoai: thu nguoi van hanh nhin thay la mot 500, khong phai mot cau
       * tra loi nghiep vu. `ConflictException`/`BadRequestException`/`NotFoundException` deu co
       * `status` duoi 500 nen KHONG tinh — chung la cau tra loi that tha. Con
       * `PrismaClientKnownRequestError` (P2002 tu `PricePeriod_one_active_per_month`) khong co
       * `status` nao ca: do dung la thu dang ro ri tren ma cua PR #118.
       */
      function leakedInfrastructureError(outcome: Outcome): string | null {
        if (outcome.ok) return null;
        const status = (outcome.error as { status?: number } | null)?.status;
        if (typeof status === 'number' && status < 500) return null;
        return outcome.error instanceof Error
          ? `${outcome.error.name}: ${outcome.error.message}`
          : String(outcome.error);
      }

      /** Mot ky CHINH THUC du gia cho toan danh muc — activate duoc neu khong vuong bat bien nao. */
      async function seedOfficial(status: 'draft' | 'active', month = MONTH) {
        const products = await prisma.product.findMany({ select: { sku: true } });
        return prisma.pricePeriod.create({
          data: {
            validMonth: month,
            status,
            source: 'operator',
            note: FIXTURE_NOTE,
            createdBy: `${PREFIX}operator`,
            ...(status === 'active' ? { activatedAt: new Date() } : {}),
            prices: { create: products.map((product) => ({ sku: product.sku, wholesale: 1_000 })) },
          },
          include: { prices: true },
        });
      }

      /** Mot ky TEST-only — luat hop le cua no la 1-2 SKU, khong phai toan danh muc. */
      async function seedTestOnly(status: 'draft' | 'active', month = MONTH) {
        return prisma.pricePeriod.create({
          data: {
            validMonth: month,
            status,
            source: TEST_ONLY_PRICE_PERIOD_SOURCE,
            note: FIXTURE_NOTE,
            createdBy: `${PREFIX}operator`,
            ...(status === 'active' ? { activatedAt: new Date() } : {}),
            prices: { create: [{ sku: SKU_A, wholesale: 1_000 }] },
          },
          include: { prices: true },
        });
      }

      /** Anh chup cac ky ACTIVE cua dung thang fixture, tach chinh thuc / test-only. */
      async function activesOfMonth(month = MONTH) {
        const rows = await prisma.pricePeriod.findMany({
          where: { validMonth: month, status: 'active', note: FIXTURE_NOTE },
          select: { id: true, source: true },
        });
        return {
          official: rows.filter((row) => row.source !== TEST_ONLY_PRICE_PERIOD_SOURCE),
          testOnly: rows.filter((row) => row.source === TEST_ONLY_PRICE_PERIOD_SOURCE),
        };
      }

      it('luoi cuoi cua database van con: mot ky ACTIVE moi thang', async () => {
        // Ca ba bai duoi day dua tren viec index nay CO THAT. `schema.prisma` khong khai no, nen
        // mot `prisma migrate dev` cua nguoi khac co the sinh ra migration XOA no ma khong ai
        // nhan ra. Bai nay lam cai chuong: mat index thi do o day, khong phai do ngoai pilot.
        const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
          SELECT "indexdef" FROM "pg_indexes"
          WHERE "tablename" = 'PricePeriod' AND "indexname" = 'PricePeriod_one_active_per_month'
        `;
        expect(index?.indexdef).toBeDefined();
        expect(index?.indexdef).toContain('UNIQUE');
        expect(index?.indexdef).toContain('validMonth');
      });

      it('hai ban nhap THUONG cung thang activate chong nhau -> mot ky ACTIVE, khong ai an 500', async () => {
        const gate = await seedOfficial('active');
        const draftA = await seedOfficial('draft');
        const draftB = await seedOfficial('draft');

        const lock = holdRowLock(gate.id);
        await lock.locked;

        // Ca hai vao khe giua "kiem" va "ghi" roi dung lai o `gate`. Cach nhau mot nhip de thu tu
        // xep hang cua Postgres la xac dinh, khong phai de mot ben kip chay xong truoc ben kia.
        const first = attempt(() => service.activate(draftA.id, 'operator', 'req-122-a'));
        await sleep(300);
        const second = attempt(() => service.activate(draftB.id, 'operator', 'req-122-b'));
        await sleep(300);

        lock.release();
        await lock.done;
        const outcomes = await Promise.all([first, second]);

        // KHANG DINH CHINH: khong ai nhan loi ha tang. Tren ma cu, ben thua an P2002 -> 500.
        expect(outcomes.map(leakedInfrastructureError).filter(Boolean)).toEqual([]);

        // Hai nguoi van hanh cung chot bang gia cua mot thang la viec HOP LE: nguoi sau de len
        // nguoi truoc, dung nhu khi ho bam cach nhau mot phut. Ca hai deu phai thanh cong.
        expect(outcomes.every((outcome) => outcome.ok)).toBe(true);

        // Va thang do chi con dung MOT ky ACTIVE (INV1).
        const actives = await activesOfMonth();
        expect(actives.official).toHaveLength(1);
        expect(actives.testOnly).toHaveLength(0);

        // Ky cu cua thang phai duoc luu tru — ben thang van lam tron viec cua no.
        const previous = await prisma.pricePeriod.findUniqueOrThrow({ where: { id: gate.id } });
        expect(previous.status).toBe('archived');
      });

      it('TEST-only vs CHINH THUC cung thang: khong bao gio cung ACTIVE, ben thua duoc noi that', async () => {
        // `gate` la ky TEST-only dang chay: CA HAI duong ghi deu phai luu tru no, nen no chan
        // duoc ca hai. (Duong chinh thuc luu tru moi ky active cung thang; duong test-only chi
        // luu tru cac ky test-only.)
        const gate = await seedTestOnly('active');
        const official = await seedOfficial('draft');
        const testOnly = await seedTestOnly('draft');

        const lock = holdRowLock(gate.id);
        await lock.locked;

        // Ban CHINH THUC vao hang truoc: Postgres danh thuc nguoi doi khoa hang theo thu tu den.
        // Nho vay tren ma cu, ban test-only kiem "co ky chinh thuc active khong" -> CHUA co, roi
        // moi ghi SAU khi ban chinh thuc da commit. Do dung la Race B cua Issue #122.
        const officialRun = attempt(() => service.activate(official.id, 'operator', 'req-122-off'));
        await sleep(300);
        const testOnlyRun = attempt(() =>
          service.activate(testOnly.id, 'operator', 'req-122-test'),
        );
        await sleep(300);

        lock.release();
        await lock.done;
        const [officialOutcome, testOnlyOutcome] = await Promise.all([officialRun, testOnlyRun]);

        // Bat bien INV2 — index giu duoc ngay ca tren ma cu, nen no khong phai phan dat gia nhat.
        const actives = await activesOfMonth();
        expect(actives.official).toHaveLength(1);
        expect(actives.testOnly).toHaveLength(0);
        expect(actives.official[0]?.id).toBe(official.id);

        // KHANG DINH CHINH: ben thua phai nhan DUNG cau tu choi da co trong hop dong #117, chu
        // khong phai mot loi P2002 cua database. Tren ma cu day la mot 500 tran trui.
        expect(officialOutcome.ok).toBe(true);
        expect(leakedInfrastructureError(testOnlyOutcome)).toBeNull();
        expect(testOnlyOutcome.ok).toBe(false);
        if (!testOnlyOutcome.ok) {
          expect(testOnlyOutcome.error).toBeInstanceOf(ConflictException);
          expect((testOnlyOutcome.error as Error).message).toContain('test-only');
        }

        // Va ky test-only thua van la NHAP — khong bi doi trang thai nua vo.
        const loser = await prisma.pricePeriod.findUniqueOrThrow({ where: { id: testOnly.id } });
        expect(loser.status).toBe('draft');
      });

      it('hai ban nhap TEST-only cung thang -> mot ky TEST-only ACTIVE, khong ai an 500', async () => {
        const gate = await seedTestOnly('active');
        const draftA = await seedTestOnly('draft');
        const draftB = await seedTestOnly('draft');

        const lock = holdRowLock(gate.id);
        await lock.locked;

        const first = attempt(() => service.activate(draftA.id, 'operator', 'req-122-t1'));
        await sleep(300);
        const second = attempt(() => service.activate(draftB.id, 'operator', 'req-122-t2'));
        await sleep(300);

        lock.release();
        await lock.done;
        const outcomes = await Promise.all([first, second]);

        expect(outcomes.map(leakedInfrastructureError).filter(Boolean)).toEqual([]);
        expect(outcomes.every((outcome) => outcome.ok)).toBe(true);

        // INV3 — va khong co ky chinh thuc nao bi keo theo.
        const actives = await activesOfMonth();
        expect(actives.testOnly).toHaveLength(1);
        expect(actives.official).toHaveLength(0);

        const previous = await prisma.pricePeriod.findUniqueOrThrow({ where: { id: gate.id } });
        expect(previous.status).toBe('archived');
      });

      it('nguoi ghi NGOAI activate() (vd panel /admin) van phai cho ra 409, khong phai 500', async () => {
        // Khoa thang chi rang buoc duoc nhung ai DI QUA `activate()`. Panel `/admin` la CRUD tu
        // sinh: no doi thang truong `status` cua mot hang, khong cam khoa nao ca. Luc do luoi cuoi
        // van la index cua database — va cai phai kiem o day la ung dung DICH duoc tieng cua index
        // sang tieng nguoi, chu khong de P2002 noi thang len thanh 500.
        const draft = await seedOfficial('draft');
        const bystander = await seedOfficial('draft');

        const flipped = deferred();
        const release = deferred();
        const done = other.$transaction(
          async (tx) => {
            await tx.pricePeriod.update({
              where: { id: bystander.id },
              data: { status: 'active', activatedAt: new Date() },
            });
            flipped.resolve();
            // Giu giao dich mo: dong `active` cua thang nay CHUA commit, nen `activate()` ben duoi
            // khong nhin thay no o buoc luu tru — nhung index thi thay, va se chan o phut cuoi.
            await release.promise;
          },
          { timeout: 30_000, maxWait: 30_000 },
        );
        await flipped.promise;

        const outcome = attempt(() => service.activate(draft.id, 'operator', 'req-122-admin'));
        await sleep(300);
        release.resolve();
        await done;

        const result = await outcome;
        expect(leakedInfrastructureError(result)).toBeNull();
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(ConflictException);

        // Va ky bi tu choi phai o nguyen trang thai nhap.
        const loser = await prisma.pricePeriod.findUniqueOrThrow({ where: { id: draft.id } });
        expect(loser.status).toBe('draft');
      });

      /**
       * Deadlock cua Postgres khong im lang: no bi phat hien va MOT ben bi huy voi `40P01`. Neu
       * giao thuc moi dat khoa sai thu tu (`khoa hang muc tieu -> roi doi khoa cua ca thang`), ma
       * so do se NOI len o day. Het gio giao dich (`P2028`) cung phai bi bat: mot giao thuc dung
       * nhung xep hang qua lau van la mot giao thuc hong.
       */
      function fatalConcurrencySymptom(outcome: Outcome): string | null {
        if (outcome.ok) return null;
        const error = outcome.error;
        const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        if (/40P01|deadlock/i.test(text)) return `deadlock: ${text}`;
        if (/P2028|Transaction (already closed|not found)|Timed out/i.test(text)) {
          return `giao dich het gio: ${text}`;
        }
        return null;
      }

      /**
       * BO NAY CO Y CHI DUNG KY TEST-ONLY, va do la mot rang buoc cua HA TANG TEST chu khong
       * phai cua nghiep vu.
       *
       * Mot ky CHINH THUC chi activate duoc khi co gia cho TOAN BO danh muc, nen `seedOfficial()`
       * phai doc `Product` roi tao mot dong `Price` cho MOI san pham — ke ca san pham tam cua mot
       * tep IT KHAC dang chay song song. Khi tep do don dep (`price.deleteMany` roi
       * `product.deleteMany`), dong `Price` cua ta tro deu san pham cua ho => `Price_sku_fkey`.
       * Bai stress nay tao ky theo vong lap nen no la cho de dam nhat.
       *
       * Ky TEST-only chi doi 1-2 SKU cua chinh bo fixture, nen no KHONG cham vao danh muc chung.
       * Va do thu can chung minh o day la THU TU DAT KHOA, khong phai luat cham diem, nen doi
       * sang test-only khong lam mat gi ca: van du ca khoa thang, khoa hang muc tieu, khoa hang
       * cua cac ky cung thang qua `updateMany`, va ba nguoi ghi cua #121 dam vao giua.
       */
      it('khong deadlock: activate/archive/remove/import dam nhau tren HAI thang', async () => {
        // Hai thang chay cung luc de bat CA hai kieu sai thu tu: trong mot thang (hai `activate`
        // + mot `archive` tranh nhau dung hang ky dang chay) va giua hai thang.
        const MONTH_B = '2099-02';

        for (let round = 0; round < 3; round += 1) {
          await cleanup();
          await seedProducts();

          const months = [];
          for (const month of [MONTH, MONTH_B]) {
            months.push({
              month,
              gate: await seedTestOnly('active', month),
              draftA: await seedTestOnly('draft', month),
              draftB: await seedTestOnly('draft', month),
              // Ky nhap RIENG cho remove/import: hai nguoi ghi cua #121 phai van chay duoc trong
              // khi hai `activate` cung thang dang xep hang.
              spare: await seedTestOnly('draft', month),
            });
          }

          const outcomes = await Promise.all(
            months.flatMap((fixture) => [
              attempt(() => service.activate(fixture.draftA.id, 'operator', null)),
              attempt(() => service.activate(fixture.draftB.id, 'operator', null)),
              // `archive` giu hang ky dang chay — dung hang ma ca hai `activate` deu can.
              attempt(() => service.archive(fixture.gate.id, 'operator', null)),
              attempt(() => service.removeDraftPrice(fixture.spare.id, SKU_A, 'operator', null)),
              attempt(() =>
                service.applyImport(
                  fixture.spare.id,
                  { rows: [{ sku: SKU_B, wholesale: 2_000 }], overwrite: true, confirmed: true },
                  'operator',
                  null,
                ),
              ),
            ]),
          );

          expect(outcomes.map(fatalConcurrencySymptom).filter(Boolean)).toEqual([]);

          // Va bat bien van dung o CA HAI thang sau con bao.
          for (const fixture of months) {
            const actives = await activesOfMonth(fixture.month);
            expect(actives.testOnly.length).toBeLessThanOrEqual(1);
            expect(actives.official).toHaveLength(0);
          }
        }
      });

      it('khoa theo thang KHONG lam mat khoa hang cua #121', async () => {
        // Bai nay giu cho giao thuc cu khoi bi giao thuc moi nuot mat. Ba lenh cham vao CUNG mot
        // thang, trong do HAI lenh cham vao CUNG mot hang:
        //   · `removeDraftPrice(draft)` vs `activate(draft)`  -> cuoc dua cua #121 (cung hang)
        //   · `activate(draft)`         vs `activate(rival)`  -> cuoc dua cua #122 (cung thang)
        const draft = await seedOfficial('draft');
        const rival = await seedOfficial('draft');

        const outcomes = await Promise.all([
          attempt(() => service.removeDraftPrice(draft.id, SKU_A, 'operator', 'req-122-mixed')),
          attempt(() => service.activate(draft.id, 'operator', 'req-122-mixed-a')),
          attempt(() => service.activate(rival.id, 'operator', 'req-122-mixed-b')),
        ]);

        expect(outcomes.map(fatalConcurrencySymptom).filter(Boolean)).toEqual([]);
        expect(outcomes.map(leakedInfrastructureError).filter(Boolean)).toEqual([]);

        // #122: ca thang chi con MOT ky ACTIVE.
        const actives = await activesOfMonth();
        expect(actives.official).toHaveLength(1);

        // #121: ky nao da thanh ACTIVE thi KHONG duoc thieu dong nao — ke ca khi `removeDraftPrice`
        // chay dung vao luc no dang doi activate.
        const activeId = actives.official[0]?.id;
        const activePeriod = await prisma.pricePeriod.findUniqueOrThrow({
          where: { id: activeId ?? draft.id },
          include: { prices: true },
        });
        const catalogue = await prisma.product.count();
        expect(activePeriod.prices).toHaveLength(catalogue);
        expect(activePeriod.prices.map((row) => row.sku)).toContain(SKU_A);
      });
    });
  },
);
