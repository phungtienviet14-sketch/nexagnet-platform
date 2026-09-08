import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import { PrismaAcceptanceRepository } from './prisma-acceptance.repository.js';
import type { AppendAcceptanceDecisionCommand } from './acceptance.repository.js';

/**
 * CA-030 — BANG CHUNG CUA `#268` TREN POSTGRES THAT.
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT chu khong phai kho in-memory:
 *
 * Phan lon nhung gi lane nay hua song o RANH GIOI voi CSDL — hai rang buoc duy nhat cua lich su
 * quyet dinh, bon `CHECK`, va TRIGGER chi-ghi-them. Kho in-memory theo dinh nghia khong co ranh
 * gioi do: no se XANH ca sau khi ai do go het chung ra. Do la bai hoc `transport-settlement.
 * int.spec.ts` da ghi lai, va o day no dat hon — cai bi go la mot bang chung tai chinh.
 *
 * `describe.runIf` theo dung quy uoc cua repo: khong co DB thi BO QUA; chung chay o job
 * `integration` cua CI tren Postgres 16 that.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Nghiem thu chung tu tren Postgres THAT — CA-030',
  () => {
    const prisma = new PrismaService();
    const repo = new PrismaAcceptanceRepository(prisma);

    /* Tien to KHONG duoc la tien to cua nhau — cac tep int chay song song. */
    const PLATE = 'IT-CA30-XE';
    const RUN_CODE = 'IT-CA30-VONGCHAY';
    const ORDER_CODE = 'IT-CA30-DONHANG';
    const PARTY = 'IT-CA30-PHAPNHAN';
    const ACTOR = 'IT-CA30-ketoan';

    const state = {
      orderId: '',
      otherOrderId: '',
      /** Vong chay CHUNG cho ca hai don — `#275` K7 bai 3 chay tren chinh hang nay. */
      sharedRunId: '',
      counterpartyId: '',
      acceptanceId: '',
    };

    const command = (
      patch: Partial<AppendAcceptanceDecisionCommand> = {},
    ): AppendAcceptanceDecisionCommand => ({
      orderId: state.orderId,
      outcome: 'APPROVED',
      reasonCode: 'DOCUMENT_RECEIVED',
      basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
      evidenceRefs: [],
      externalNote: 'B giu ban goc phieu giao',
      counterpartyId: null,
      supersedesId: null,
      idempotencyKey: 'it-ca30-idem-1',
      decidedBy: ACTOR,
      decidedAt: new Date('2026-09-08T03:15:00.000Z'),
      businessDate: '2026-09-08' as BusinessDate,
      ...patch,
    });

    /**
     * Don dep phai TAT TRIGGER chi-ghi-them, cung khuon
     * `transport-driver-settlement.int.spec.ts`: cai bao ve du lieu that cung chan ca duong don
     * dep cua bai test, va do la bang chung rang no dang bao ve that.
     */
    async function cleanup(): Promise<void> {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "TransportCommercialAcceptanceDecision" DISABLE TRIGGER "transport_commercial_acceptance_append_only"',
        );
        await tx.$executeRawUnsafe(
          'DELETE FROM "TransportCommercialAcceptanceDecision" WHERE "decidedBy" LIKE $1',
          `${ACTOR}%`,
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE "TransportCommercialAcceptanceDecision" ENABLE TRIGGER "transport_commercial_acceptance_append_only"',
        );
      });
      await prisma.transportCommercialAcceptance.deleteMany({
        where: { openedBy: { startsWith: ACTOR } },
      });
      await prisma.transportRunLeg.deleteMany({
        where: { run: { code: { startsWith: RUN_CODE } } },
      });
      await prisma.transportVehicleRun.deleteMany({ where: { code: { startsWith: RUN_CODE } } });
      await prisma.transportOrder.deleteMany({ where: { code: { startsWith: ORDER_CODE } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE } },
      });
      await prisma.transportCounterparty.deleteMany({ where: { name: { startsWith: PARTY } } });
    }

    /**
     * BAY DAT: HAI DON tren MOT vong chay DANG CHAY.
     *
     * Vong chay co y de o `ACTIVE`, khong `COMPLETED`. `#275` K7 doi chung minh rang trang thai
     * vong chay khong tham gia vao quyet dinh ket thuc don — mot bo bai dat san vong chay o
     * `COMPLETED` se van xanh ke ca khi ai do noi lai hai truc voi nhau.
     */
    beforeAll(async () => {
      await cleanup();

      const vehicle = await prisma.transportVehicle.create({
        data: { registrationPlate: `${PLATE}-1`, vehicleClass: 'DAU_KEO' },
      });
      const order = await prisma.transportOrder.create({
        data: {
          code: `${ORDER_CODE}-1`,
          status: 'FULFILLED',
          businessDate: '2026-09-08',
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
        },
      });
      const other = await prisma.transportOrder.create({
        data: {
          code: `${ORDER_CODE}-2`,
          status: 'FULFILLED',
          businessDate: '2026-09-08',
          originLabel: 'Hai Phong',
          destinationLabel: 'Ninh Binh',
        },
      });
      const run = await prisma.transportVehicleRun.create({
        data: {
          code: `${RUN_CODE}-1`,
          vehicleId: vehicle.id,
          status: 'ACTIVE',
          businessDate: '2026-09-08',
        },
      });
      await prisma.transportRunLeg.createMany({
        data: [
          {
            runId: run.id,
            sequence: 1,
            kind: 'LOADED',
            orderId: order.id,
            originLabel: 'Ha Noi',
            destinationLabel: 'Hai Phong',
            businessDate: '2026-09-08',
          },
          {
            runId: run.id,
            sequence: 2,
            kind: 'LOADED',
            orderId: other.id,
            originLabel: 'Hai Phong',
            destinationLabel: 'Ninh Binh',
            businessDate: '2026-09-08',
          },
        ],
      });
      const party = await prisma.transportCounterparty.create({ data: { name: `${PARTY}-1` } });

      state.orderId = order.id;
      state.otherOrderId = other.id;
      state.sharedRunId = run.id;
      state.counterpartyId = party.id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('ghi mot quyet dinh dau tien: ho so mo ra, hinh chieu tro dung ban moi nhat', async () => {
      const outcome = await repo.append(command());

      expect(outcome.replayed).toBe(false);
      expect(outcome.decision.sequence).toBe(1);
      expect(outcome.acceptance.state).toBe('APPROVED');
      expect(outcome.acceptance.latestDecisionId).toBe(outcome.decision.id);
      expect(outcome.acceptance.openedBy).toBe(ACTOR);
      state.acceptanceId = outcome.acceptance.id;
      // Gio den tu lenh (tuc tu dong ho may chu), khong tu `DEFAULT now()`.
      expect(outcome.decision.decidedAt).toBe('2026-09-08T03:15:00.000Z');
    });

    /**
     * CHONG GHI TRUNG o muc CSDL — `#268` I4.
     *
     * Hai loi goi cung `idempotencyKey` CHAY SONG SONG. Duong doc-truoc cua tang dich vu khong cuu
     * duoc truong hop nay: ca hai deu thay "chua co". Chi rang buoc duy nhat tra loi duoc.
     */
    it('hai loi goi song song cung khoa chi de lai MOT quyet dinh', async () => {
      const results = await Promise.allSettled([
        repo.append(command({ idempotencyKey: 'it-ca30-song-song' })),
        repo.append(command({ idempotencyKey: 'it-ca30-song-song' })),
      ]);

      const rows = await prisma.transportCommercialAcceptanceDecision.count({
        where: { idempotencyKey: 'it-ca30-song-song' },
      });
      expect(rows).toBe(1);

      // Khong loi goi nao duoc phep hong bang mot loi KHONG CO KIEU.
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toMatchObject({ reason: 'ACCEPTANCE_DECISION_SEQUENCE_CONFLICT' });
        }
      }
    });

    it('mot don chi co MOT ho so', async () => {
      await expect(
        prisma.transportCommercialAcceptance.create({
          data: {
            orderId: state.orderId,
            state: 'APPROVED',
            businessDate: '2026-09-08',
            openedBy: `${ACTOR}-trung`,
          },
        }),
      ).rejects.toThrow();
    });

    /**
     * BAI QUAN TRONG NHAT CUA TEP — `#268` I7 bai 11.
     *
     * Khong di qua Prisma model API ma di bang SQL THO, vi day dung la duong ma mot nguoi co quyen
     * vao DB se dung. Neu chi kiem qua tang dich vu thi bai nay chi chung minh rang DUONG DO khong
     * sua — khong chung minh duoc rang KHONG CO duong nao sua duoc.
     */
    it('KHONG sua duoc mot quyet dinh da ghi — trigger chan ca SQL tho', async () => {
      const decision = await prisma.transportCommercialAcceptanceDecision.findFirstOrThrow({
        where: { decidedBy: ACTOR },
      });

      await expect(
        prisma.$executeRawUnsafe(
          /*
           * ÉP KIỂU TƯỜNG MINH — không phải trang trí.
           *
           * Postgres KHÔNG tự ép `text` sang enum cho một tham số buộc, nên bản đầu của bài này
           * hỏng ở `42804` (sai kiểu) TRƯỚC khi chạm tới trigger. Nó vẫn "ném", nên bài vẫn XANH
           * nếu chỉ khẳng định là có ném — tức một bài chứng minh sai điều nó tưởng đang chứng
           * minh. Ép kiểu ở đây làm câu lệnh HỢP LỆ, để thứ duy nhất còn có thể chặn nó là trigger.
           */
          'UPDATE "TransportCommercialAcceptanceDecision" SET "outcome" = $1::"TransportCommercialAcceptanceOutcome" WHERE "id" = $2',
          'REJECTED',
          decision.id,
        ),
      ).rejects.toThrow(/append_only/);

      const after = await prisma.transportCommercialAcceptanceDecision.findUniqueOrThrow({
        where: { id: decision.id },
      });
      expect(after.outcome).toBe(decision.outcome);
      expect(after.decidedBy).toBe(decision.decidedBy);
      expect(after.decidedAt.toISOString()).toBe(decision.decidedAt.toISOString());
    });

    it('KHONG xoa duoc mot quyet dinh da ghi', async () => {
      const decision = await prisma.transportCommercialAcceptanceDecision.findFirstOrThrow({
        where: { decidedBy: ACTOR },
      });

      await expect(
        prisma.$executeRawUnsafe(
          'DELETE FROM "TransportCommercialAcceptanceDecision" WHERE "id" = $1',
          decision.id,
        ),
      ).rejects.toThrow(/append_only/);
    });

    it('doi y giu CA HAI quyet dinh, va hinh chieu tro ban moi', async () => {
      const first = await repo.append(
        command({
          orderId: state.otherOrderId,
          outcome: 'NEEDS_CORRECTION',
          reasonCode: 'MISSING_RECEIPT',
          idempotencyKey: 'it-ca30-sua-1',
        }),
      );
      const second = await repo.append(
        command({
          orderId: state.otherOrderId,
          supersedesId: first.decision.id,
          idempotencyKey: 'it-ca30-sua-2',
        }),
      );

      expect(second.decision.sequence).toBe(2);
      expect(second.acceptance.state).toBe('APPROVED');
      expect(second.acceptance.latestDecisionId).toBe(second.decision.id);

      const detail = await repo.findDetailByOrder(state.otherOrderId);
      expect(detail?.decisions.map((entry) => entry.outcome)).toEqual([
        'NEEDS_CORRECTION',
        'APPROVED',
      ]);
      expect(detail?.decisions[1]?.supersedesId).toBe(first.decision.id);
    });

    /**
     * BON `CHECK` — chung khong the hien duoc trong `schema.prisma`, nen chung chi ton tai o SQL
     * tho cua migration. Bai duoi day di bang SQL tho de chung minh chung THUC SU tu choi ghi.
     */
    describe('CHECK cua kho', () => {
      const insertDecision = (column: string, value: string) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO "TransportCommercialAcceptanceDecision"
             ("id", "acceptanceId", "sequence", "outcome", "reasonCode", "basis",
              "evidenceRefs", "idempotencyKey", "decidedBy", "decidedAt")
           VALUES ($1, $2, $3, 'APPROVED', $4, 'EXTERNAL_PHYSICAL_CONFIRMATION',
                   ARRAY[]::text[], $5, $6, now())`,
          `it-ca30-check-${column}`,
          state.acceptanceId,
          column === 'sequence' ? Number(value) : 99,
          column === 'reasonCode' ? value : 'OK_CODE',
          `it-ca30-check-${column}`,
          column === 'decidedBy' ? value : ACTOR,
        );

      it('ngay nghiep vu phai dang ISO', async () => {
        await expect(
          prisma.$executeRawUnsafe(
            'UPDATE "TransportCommercialAcceptance" SET "businessDate" = $1 WHERE "orderId" = $2',
            '08/09/2026',
            state.orderId,
          ),
        ).rejects.toThrow(/businessDate_iso/);
      });

      it('so thu tu phai tu 1 tro len', async () => {
        await expect(insertDecision('sequence', '0')).rejects.toThrow(/sequence_positive/);
      });

      it('ma ly do khong duoc rong', async () => {
        await expect(insertDecision('reasonCode', '   ')).rejects.toThrow(/reason_not_blank/);
      });

      it('nguoi quyet khong duoc rong', async () => {
        await expect(insertDecision('decidedBy', '  ')).rejects.toThrow(/decidedBy_not_blank/);
      });
    });

    /**
     * TUONG THICH LICH SU — `#275` K6.
     *
     * Mot don DA TON TAI TU TRUOC tinh nang nay khong co ho so ket thuc nao, va do KHONG phai mot
     * loi du lieu: no doc len la `PENDING`. Bai nay khoa dieu do lai, vi mot lan "sua cho gon" bang
     * cach sinh hang `PENDING` cho moi don cu se lam dung cai backfill gia ma `#275` K6 cam.
     */
    it('don cu khong co ho so ket thuc -> doc len la khong co hang, khong phai loi', async () => {
      const legacy = await prisma.transportOrder.create({
        data: {
          code: `${ORDER_CODE}-cu`,
          status: 'FULFILLED',
          businessDate: '2026-08-01',
          originLabel: 'Ha Noi',
          destinationLabel: 'Vinh',
        },
      });

      expect(await repo.findByOrder(legacy.id)).toBeNull();
      expect(await repo.findDetailByOrder(legacy.id)).toBeNull();
      expect(await repo.findManyByOrders([legacy.id])).toEqual([]);
    });

    /**
     * `#275` K7 bai 3 tren POSTGRES THAT — hai don tren MOT vong chay, quyet dinh doc lap.
     *
     * Ca hai don deu treo tren `state.sharedRunId`, va vong chay do dang `ACTIVE`. Bai nay chay sau
     * cac bai o tren, luc do `state.orderId` DA `APPROVED` va `state.otherOrderId` DA `APPROVED`
     * qua duong sua — nen phan chung minh nam o CAU TRUC: hai ho so, hai hang, khong hang nao mang
     * `runId`, va vong chay khong he doi trang thai.
     */
    it('hai don tren mot vong chay co HAI ho so rieng, va vong chay khong bi dung toi', async () => {
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: state.sharedRunId },
        orderBy: { sequence: 'asc' },
      });
      expect(legs.map((leg) => leg.orderId)).toEqual([state.orderId, state.otherOrderId]);

      const rows = await prisma.transportCommercialAcceptance.findMany({
        where: { orderId: { in: [state.orderId, state.otherOrderId] } },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.runId === null)).toBe(true);

      const run = await prisma.transportVehicleRun.findUniqueOrThrow({
        where: { id: state.sharedRunId },
      });
      expect(run.status).toBe('ACTIVE');
      expect(run.completedAt).toBeNull();
    });

    /**
     * `#275` K1/K5 — DUNG MOT CHU THE, cuong che o DB.
     *
     * Ca hai huong sai deu phai bi tu choi: khong chu the nao, va ca hai chu the. Neu chi kiem mot
     * huong thi mot lan sua sau nay co the mo huong con lai ma khong ai thay.
     */
    describe('CHECK mot chu the duy nhat', () => {
      const insertAcceptance = (columns: string, values: string) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO "TransportCommercialAcceptance"
             ("id", ${columns}, "state", "businessDate", "openedBy", "updatedAt")
           VALUES ($1, ${values}, 'APPROVED', '2026-09-08', $2, now())`,
          `it-ca30-subject-${columns.length}`,
          `${ACTOR}-subject`,
        );

      it('khong chu the nao thi bi tu choi', async () => {
        await expect(insertAcceptance('"orderId"', 'NULL')).rejects.toThrow(/subject_exactly_one/);
      });

      it('CA HAI chu the cung luc thi bi tu choi', async () => {
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "TransportCommercialAcceptance"
               ("id", "orderId", "runId", "state", "businessDate", "openedBy", "updatedAt")
             VALUES ($1, $2, $3, 'APPROVED', '2026-09-08', $4, now())`,
            'it-ca30-subject-ca-hai',
            state.otherOrderId,
            state.sharedRunId,
            `${ACTOR}-subject`,
          ),
        ).rejects.toThrow(/subject_exactly_one/);
      });
    });

    /**
     * `#275` K5 — LIEN KET THUONG MAI la MOT-MOT hai chieu, cuong che o DB.
     *
     * Day la duong ma cong doi soat di de tim chu the cua mot nguon quyet toan. Neu mot chuyen co
     * hai don, hoac mot don treo tren hai chuyen, thi cau hoi "don cua nguon nay la don nao" co hai
     * cau tra loi — va cong se chon bua.
     */
    it('mot chuyen chi tro toi MOT don, va mot don chi nhan MOT chuyen', async () => {
      const trip = await prisma.transportTrip.create({
        data: {
          code: `${ORDER_CODE}-CHUYEN`,
          kind: 'EXTERNAL_CARRIER',
          businessDate: '2026-09-08',
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
        },
      });
      const otherTrip = await prisma.transportTrip.create({
        data: {
          code: `${ORDER_CODE}-CHUYEN-2`,
          kind: 'EXTERNAL_CARRIER',
          businessDate: '2026-09-08',
          originLabel: 'Ha Noi',
          destinationLabel: 'Vinh',
        },
      });

      await prisma.transportTripOrderLink.create({
        data: { tripId: trip.id, orderId: state.orderId, projectedBy: `${ACTOR}-chieu` },
      });

      // Cung mot chuyen, mot don khac -> khoa chinh `tripId` chan.
      await expect(
        prisma.transportTripOrderLink.create({
          data: { tripId: trip.id, orderId: state.otherOrderId, projectedBy: `${ACTOR}-chieu` },
        }),
      ).rejects.toThrow();

      // Cung mot don, mot chuyen khac -> `orderId @unique` chan.
      await expect(
        prisma.transportTripOrderLink.create({
          data: { tripId: otherTrip.id, orderId: state.orderId, projectedBy: `${ACTOR}-chieu` },
        }),
      ).rejects.toThrow();

      await prisma.transportTripOrderLink.deleteMany({ where: { tripId: trip.id } });
      await prisma.transportTrip.deleteMany({ where: { code: { startsWith: ORDER_CODE } } });
    });
  },
);
