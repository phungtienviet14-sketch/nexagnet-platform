import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { effectiveLineDecisions } from '../fuel/fuel-decision-revision.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from '../fuel/fuel-policy.js';
import { FuelReconciliationService } from '../fuel/fuel-reconciliation.service.js';
import { sumAcceptedSettlement } from '../fuel/fuel-settlement.js';
import { FileFuelStatementSource } from '../fuel/fuel-statement-source.js';
import { FuelStatementService } from '../fuel/fuel-statement.service.js';
import { deleteFuelDiscrepanciesForTest } from '../fuel/fuel-test-cleanup.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from '../fuel/fuel.ports.js';
import { FuelService } from '../fuel/fuel.service.js';
import { PrismaFuelStationRepository } from '../fuel/prisma-fuel-station.repository.js';
import { PrismaFuelRepository } from '../fuel/prisma-fuel.repository.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaSettlementRepository } from './prisma-settlement.repository.js';
import { SettlementOrderCompletionGate } from './settlement-order-completion.port.js';
import { FuelSettlementSourceAdapter, SettlementCoreFactsAdapter } from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';

/**
 * `#317` G0 — DOI Y SAU KHI MO LAI KY, TREN POSTGRES THAT, TOI TAN CONG NO NHA CUNG CAP.
 *
 * ============================================================================================
 * `OWNER_DECISIONS_2026_09_17`, G0
 *
 * *"`ACCEPT_SUPPLIER_AMOUNT -> IGNORE_WITH_REASON` sau reopen phai lam dong do khong con dong gop
 * vao accepted total; neu Supplier AP cua revision truoc da duoc ghi nhan, correction phai di qua
 * adjustment/reversal delta o Settlement, khong sua/xoa chung tu cu; retry/reopen/concurrency phai
 * idempotent va audit duoc."*
 *
 * ============================================================================================
 * NHUNG GI CHI POSTGRES CHUNG MINH DUOC
 *
 *   · trigger `transport_fuel_discrepancy_decision_append_only` tu choi dua quyet dinh cu ve
 *     `PENDING`, sua de, hay xoa — ba lenh "sua de" ma mot ban va vung ve se viet (doi chung am);
 *   · UNIQUE `supersedesId` + `CHECK` hinh dang: chuoi quyet dinh khong re nhanh ngay ca khi mot duong
 *     ghi bo qua khoa hang doi soat;
 *   · khoa hang doi soat noi tiep hoa hai lan doi y dong thoi — dung mot thang;
 *   · `@@unique([sourceContext, sourceId])` o Settlement: ban DIEU CHINH chi sinh mot lan du ingest
 *     bao nhieu lan, song song hay tuan tu.
 *
 * ============================================================================================
 * KHONG GOI VONG QUET (`FuelHandoffDrainService`)
 *
 * Vong quet la TOAN CUC va chi `transport-fuel-handoff-drain.int.spec.ts` duoc dung no (tep do xoa
 * hang vi tri quet trong cleanup). Tep nay goi THANG `SettlementService.ingestFuelHandoff()` — chinh
 * ham ma vong quet goi cho moi ky — nen moi khang dinh nham dung ky cua fixture, khong cuop hop thu
 * cua tep khac (`int-spec-khong-khang-dinh-tren-so-toan-cuc`).
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'G0 — quyet dinh doi soat chi-ghi-them toi cong no nha cung cap, tren Postgres THAT — #317',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
    const settlementRepo = new PrismaSettlementRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);

    const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
    const COSTING_POLICY: TransportCostingPolicy = {
      expenseCategories: [],
      advanceApprovalRequired: false,
    };
    const FUEL_POLICY: TransportFuelPolicy = {
      matching: { amountVnd: 1_000, businessDateDays: 1 },
      statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
      consumption: { normsByVehicleClass: {}, tolerancePercent: 10 },
    };

    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const costing = new CostingService(
      costingRepo,
      new TransportCoreFactsAdapter(trips, fleet),
      audit,
      CORE_POLICY,
      COSTING_POLICY,
    );
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      new CostingFuelExpenseAdapter(costing),
      audit,
      CORE_POLICY,
      FUEL_POLICY,
    );
    const statements = new FuelStatementService(
      fuelRepo,
      new FileFuelStatementSource(),
      fuelCore,
      audit,
      FUEL_POLICY,
    );
    const reconciliation = new FuelReconciliationService(fuelRepo, audit, FUEL_POLICY);

    /** Ban gia NEM neu bi hoi — duong ban giao cay xang khong duoc dung cong ket thuc don. */
    class UnusedCompletionGate extends SettlementOrderCompletionGate {
      eligibilityForTrip(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }

      eligibilityForOrder(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }
    }

    /** MOT ban `SettlementService` doc lap — nhieu ban la nhieu "tien trinh API". */
    const buildIngest = (): SettlementService =>
      new SettlementService(
        settlementRepo,
        new SettlementCoreFactsAdapter(trips),
        new FuelSettlementSourceAdapter(fuelRepo),
        new UnusedCompletionGate(),
      );

    // Tien to RIENG cua tep, khong long voi tien to nao dang co (`tien-to-fixture-it-khong-duoc-long-nhau`).
    const SUPPLIER_CODE = 'IT-G0R-CX';
    const CODE_PREFIX = 'IT-G0R-CH';
    const PHONE_PREFIX = '0944G0R';
    const PLATE_PREFIX = 'IT-G0R-XE';
    const ACTOR = 'it-g0r-ke-toan';
    const DIRECTOR = 'it-g0r-giam-doc';
    const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

    const state = {
      supplierId: '',
      driverId: '',
      vehicleId: '',
      tripId: '',
      reconciliationId: '',
      statementId: '',
      matchedLineId: '',
      orphanLineId: '',
      firstDecisionId: '',
      revisionId: '',
      originalDocumentId: '',
      handoffRevision2Id: '',
    };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: SUPPLIER_CODE } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);

      const recons = await prisma.transportFuelReconciliation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const reconIds = recons.map((row) => row.id);

      await prisma.transportSettlementFuelHandoffCursor.deleteMany({
        where: { reconciliationId: { in: reconIds } },
      });
      // Ban giao: tu ban moi nhat ve ban goc (`supersedesId` RESTRICT).
      for (const minimum of [3, 2, 1]) {
        await prisma.transportFuelSettlementHandoff.deleteMany({
          where: { reconciliationId: { in: reconIds }, revision: { gte: minimum } },
        });
      }
      await prisma.transportFuelMatch.deleteMany({ where: { reconciliationId: { in: reconIds } } });
      await deleteFuelDiscrepanciesForTest(prisma, reconIds);
      await prisma.transportFuelReconciliation.deleteMany({ where: { id: { in: reconIds } } });

      const statementRows = await prisma.transportFuelSupplierStatement.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const statementIds = statementRows.map((row) => row.id);
      await prisma.transportFuelStatementLine.deleteMany({
        where: { statementId: { in: statementIds } },
      });
      const entries = await prisma.transportFuelEntry.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      await prisma.transportFuelReceiptEvidence.deleteMany({
        where: { fuelEntryId: { in: entries.map((row) => row.id) } },
      });
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplierStatement.deleteMany({
        where: { id: { in: statementIds } },
      });

      for (const kind of ['ADJUSTMENT', 'REVERSAL', 'ORIGINAL'] as const) {
        await prisma.transportSettlementDocument.deleteMany({
          where: { counterpartyId: { in: supplierIds }, kind },
        });
      }
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

      const owned = await prisma.transportTrip.findMany({
        where: { code: { startsWith: CODE_PREFIX } },
        select: { id: true },
      });
      const tripIds = owned.map((row) => row.id);
      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      for (const kind of ['REVERSAL', 'ADVANCE', 'RETURN', 'TRIP_EXPENSE', 'ADJUSTMENT'] as const) {
        await prisma.transportDriverFundEntry.deleteMany({
          where: { accountId: { in: accountIds }, kind },
        });
      }
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    const supplierDocuments = () =>
      prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: state.supplierId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

    const orphanDecisions = () =>
      prisma.transportFuelDiscrepancy.findMany({
        where: { reconciliationId: state.reconciliationId, statementLineId: state.orphanLineId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

    const currentOrphanDecisionId = async (): Promise<string> => {
      const effective = effectiveLineDecisions(
        await fuelRepo.listDiscrepancies(state.reconciliationId),
      ).get(state.orphanLineId);
      if (!effective) throw new Error('Dong le khong co quyet dinh hieu luc');
      return effective.id;
    };

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang kiem thu G0',
          code: SUPPLIER_CODE,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-09-01T00:00:00Z'),
        })
      ).id;
      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT G0R Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: 'IT-G0R-user',
        })
      ).id;
      state.vehicleId = (
        await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-A`,
          vehicleClass: 'tai-5-tan',
          allowedPayloadKg: 5_000,
        })
      ).id;
      state.tripId = (
        await trips.create({
          code: `${CODE_PREFIX}-OWN`,
          kind: 'OWN_DIRECT',
          businessDate: '2026-09-05',
          originLabel: 'Ha Noi',
          destinationLabel: 'Thai Nguyen',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 12_000_000,
          distanceKm: 500,
        })
      ).id;
      await trips.assign(state.tripId, {
        vehicleId: state.vehicleId,
        driverId: state.driverId,
        assignedBy: 'it-g0r',
        at: new Date('2026-09-05T00:00:00Z'),
      });

      const entry = await fuel.submitFuelEntry(
        {
          tripId: state.tripId,
          vehicleId: state.vehicleId,
          driverId: state.driverId,
          supplierId: state.supplierId,
          liters: '200',
          amount: 4_200_000,
          odometerKm: 300_000,
          occurredAt: '2026-09-05T06:00:00+07:00',
          businessDate: '2026-09-05',
          paymentMethod: 'SUPPLIER_ACCOUNT',
          correlationKey: 'it-g0r-phieu-khop',
        },
        ACTOR,
      );
      await fuel.verifyFuelEntry(entry.id, ACTOR);

      const plate = `${PLATE_PREFIX}-A`;
      const csv = [
        'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
        `${plate},2026-09-05,200,4.200.000,,`,
        `${plate},2026-09-20,90,2.000.000,HD-G0R-LE,khong co phieu tuong ung`,
      ].join('\n');
      const imported = await statements.commitImport(
        {
          supplierId: state.supplierId,
          periodStart: PERIOD.start,
          periodEnd: PERIOD.end,
          filename: 'it-g0r-bang-ke.csv',
          format: 'CSV',
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        },
        ACTOR,
      );
      state.reconciliationId = imported.reconciliation.id;
      state.statementId = imported.statement.id;
      state.matchedLineId = imported.lines.find((line) => line.rowNumber === 1)?.id as string;
      state.orphanLineId = imported.lines.find((line) => line.rowNumber === 2)?.id as string;

      await reconciliation.runMatching(state.reconciliationId, ACTOR);
    }, 120_000);

    /* ================================================================ *
     * G0R-1 — ACCEPT roi dong ky: mot chung tu goc
     * ================================================================ */

    it('G0R-1 — chap nhan dong le + dong ky -> ban giao 6.200.000 -> MOT chung tu goc', async () => {
      const [pending] = (await fuelRepo.listDiscrepancies(state.reconciliationId)).filter(
        (item) => item.status === 'PENDING' && item.statementLineId === state.orphanLineId,
      );
      expect(pending).toBeDefined();
      await reconciliation.resolveDiscrepancy(
        pending!.id,
        { resolution: 'ACCEPT_SUPPLIER_AMOUNT', note: 'chap nhan so cua cay xang' },
        ACTOR,
      );
      state.firstDecisionId = pending!.id;

      const closed = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      expect(closed.handoff).toMatchObject({ revision: 1, acceptedAmount: 6_200_000 });

      await buildIngest().ingestFuelHandoff(state.reconciliationId, ACTOR);
      const documents = await supplierDocuments();
      expect(documents).toHaveLength(1);
      expect(documents[0]).toMatchObject({ kind: 'ORIGINAL', flow: 'FUEL_SUPPLIER' });
      expect(Number(documents[0]!.signedAmount)).toBe(-6_200_000);
      state.originalDocumentId = documents[0]!.id;
    });

    /* ================================================================ *
     * G0R-2..4 — mo lai, doi y, dong lai: ban DIEU CHINH, chung tu cu nguyen
     * ================================================================ */

    it('G0R-2 — mo lai + doi ACCEPT -> IGNORE: THEM mot hang, hang cu nguyen van; gui lai la phat lai', async () => {
      const before = await prisma.transportFuelDiscrepancy.findUniqueOrThrow({
        where: { id: state.firstDecisionId },
      });

      await reconciliation.reopenReconciliation(
        state.reconciliationId,
        'cay xang rut dong 20/09',
        DIRECTOR,
      );
      const command = {
        resolution: 'IGNORE_WITH_REASON' as const,
        reason: 'cay xang xac nhan dong 20/09 ghi nham xe',
      };
      const revised = await reconciliation.reviseDiscrepancyDecision(
        state.firstDecisionId,
        command,
        ACTOR,
      );
      const retry = await reconciliation.reviseDiscrepancyDecision(
        state.firstDecisionId,
        command,
        ACTOR,
      );
      state.revisionId = revised.revision.id;

      expect(revised.replayed).toBe(false);
      expect(retry).toMatchObject({ replayed: true, revision: { id: revised.revision.id } });

      const rows = await orphanDecisions();
      expect(rows).toHaveLength(2);
      // Hang cu: KHONG MOT COT NAO doi — ca `status`, `resolution`, dau vet nguoi/luc quyet.
      expect(rows.find((row) => row.id === state.firstDecisionId)).toEqual(before);
      expect(rows.find((row) => row.id === state.revisionId)).toMatchObject({
        status: 'RESOLVED',
        resolution: 'IGNORE_WITH_REASON',
        resolutionNote: command.reason,
        resolvedBy: ACTOR,
        supersedesId: state.firstDecisionId,
      });
      const line = await prisma.transportFuelStatementLine.findUniqueOrThrow({
        where: { id: state.orphanLineId },
      });
      expect(line.reconciliationStatus).toBe('IGNORED');
    });

    it('G0R-3 — dong lai -> ban giao so 2 GIAM con 4.200.000; Settlement ghi ADJUSTMENT +2.000.000, chung tu goc KHONG doi', async () => {
      const originalBefore = await prisma.transportSettlementDocument.findUniqueOrThrow({
        where: { id: state.originalDocumentId },
      });

      const closed = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      expect(closed.handoff).toMatchObject({
        revision: 2,
        acceptedAmount: 4_200_000,
        acceptedLineCount: 1,
        acceptedLineIds: [state.matchedLineId],
      });
      state.handoffRevision2Id = closed.handoff.id;

      await buildIngest().ingestFuelHandoff(state.reconciliationId, ACTOR);

      const documents = await supplierDocuments();
      expect(documents).toHaveLength(2);
      const original = documents.find((row) => row.id === state.originalDocumentId);
      const adjustment = documents.find((row) => row.kind === 'ADJUSTMENT');
      // Chung tu goc KHONG bi sua, KHONG bi xoa, KHONG bi dao.
      expect(original).toEqual(originalBefore);
      expect(Number(adjustment!.signedAmount)).toBe(2_000_000);
      expect(adjustment).toMatchObject({
        adjustsId: state.originalDocumentId,
        sourceContext: 'FUEL_SETTLEMENT_HANDOFF',
        sourceId: state.handoffRevision2Id,
        status: 'POSTED',
      });
      const net = documents.reduce((total, row) => total + Number(row.signedAmount), 0);
      expect(net).toBe(-4_200_000);
    });

    it('G0R-4 — ingest lai 3 lan tuan tu + 4 lan SONG SONG -> van dung hai chung tu', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await buildIngest().ingestFuelHandoff(state.reconciliationId, `it-g0r-lap-${attempt}`);
      }
      await Promise.all(
        [1, 2, 3, 4].map((index) =>
          buildIngest().ingestFuelHandoff(state.reconciliationId, `it-g0r-song-song-${index}`),
        ),
      );

      const documents = await supplierDocuments();
      expect(documents.map((row) => row.kind).sort()).toEqual(['ADJUSTMENT', 'ORIGINAL']);
    });

    /* ================================================================ *
     * G0R-5, G0R-6 — DOI CHUNG AM: canh dung that su tai hien loi cu
     * ================================================================ */

    /**
     * Phep cong CU (`e748305`), nguyen van, chay tren CHINH du lieu Postgres cua ky nay. Neu no cung ra
     * 4.200.000 thi canh o tren khong tai hien G0 va moi bai xanh o tren la xanh vo nghia.
     */
    it('G0R-5 — doi chung am: phep cong CU tren du lieu nay van ra 6.200.000 (tong khong giam duoc)', async () => {
      const lines = await fuelRepo.listStatementLines(state.statementId);
      const matches = await fuelRepo.listMatches(state.reconciliationId);
      const discrepancies = await fuelRepo.listDiscrepancies(state.reconciliationId);

      const acceptedLineIds = new Set(matches.map((match) => match.statementLineId));
      for (const discrepancy of discrepancies) {
        if (discrepancy.resolution !== 'ACCEPT_SUPPLIER_AMOUNT') continue;
        if (discrepancy.statementLineId) acceptedLineIds.add(discrepancy.statementLineId);
      }
      const legacyTotal = lines
        .filter((line) => acceptedLineIds.has(line.id))
        .reduce((total, line) => total + (line.amount ?? 0), 0);

      expect(legacyTotal).toBe(6_200_000);
      expect(sumAcceptedSettlement({ lines, matches, discrepancies }).amount).toBe(4_200_000);
      expect((await fuelRepo.findHandoff(state.reconciliationId))?.acceptedAmount).toBe(4_200_000);
    });

    /**
     * Ba lenh "sua de" ma mot ban va vung ve cho G0 se viet — dua ve PENDING, sua `resolution` tai
     * cho, xoa roi quyet lai — chay NGUYEN VAN tren Postgres. Ca ba PHAI bi trigger tu choi, va hang cu
     * PHAI con nguyen sau ca ba.
     */
    it('G0R-6 — doi chung am CSDL: reset ve PENDING / sua tai cho / xoa quyet dinh cu deu bi tu choi', async () => {
      const before = await prisma.transportFuelDiscrepancy.findUniqueOrThrow({
        where: { id: state.firstDecisionId },
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "TransportFuelDiscrepancy"
             SET "status" = 'PENDING', "resolution" = NULL, "resolutionNote" = NULL,
                 "resolvedAt" = NULL, "resolvedBy" = NULL
           WHERE "id" = $1`,
          state.firstDecisionId,
        ),
      ).rejects.toThrow(/transport_fuel_discrepancy_decision_append_only/);

      await expect(
        prisma.transportFuelDiscrepancy.updateMany({
          where: { id: state.firstDecisionId },
          data: { resolution: 'IGNORE_WITH_REASON' },
        }),
      ).rejects.toThrow(/transport_fuel_discrepancy_decision_append_only/);

      await expect(
        prisma.$executeRawUnsafe(
          'DELETE FROM "TransportFuelDiscrepancy" WHERE "id" = $1',
          state.firstDecisionId,
        ),
      ).rejects.toThrow(/transport_fuel_discrepancy_decision_append_only/);

      // Hang MAY sinh (PENDING) van xoa duoc — lan chay lai so khop khong bi trigger chan.
      await expect(
        prisma.transportFuelDiscrepancy.deleteMany({
          where: { reconciliationId: state.reconciliationId, status: 'PENDING' },
        }),
      ).resolves.toBeDefined();

      expect(
        await prisma.transportFuelDiscrepancy.findUniqueOrThrow({
          where: { id: state.firstDecisionId },
        }),
      ).toEqual(before);
    });

    /* ================================================================ *
     * G0R-7, G0R-8 — dong thoi, va chuoi khong re nhanh
     * ================================================================ */

    it('G0R-7 — hai lan doi y SONG SONG tren cung quyet dinh: dung mot thang, mot nhan DECISION_NOT_CURRENT', async () => {
      await reconciliation.reopenReconciliation(state.reconciliationId, 'soat lai lan 2', DIRECTOR);
      const current = await currentOrphanDecisionId();
      expect(current).toBe(state.revisionId);

      const outcomes = await Promise.allSettled([
        reconciliation.reviseDiscrepancyDecision(
          current,
          { resolution: 'REJECT_SUPPLIER_LINE', reason: 'song song A' },
          'it-g0r-ke-toan-a',
        ),
        reconciliation.reviseDiscrepancyDecision(
          current,
          { resolution: 'ENTRY_CORRECTION_REQUIRED', reason: 'song song B' },
          'it-g0r-ke-toan-b',
        ),
      ]);

      const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        kind: 'CONFLICT',
        reason: 'DECISION_NOT_CURRENT',
      });

      const successors = await prisma.transportFuelDiscrepancy.findMany({
        where: { supersedesId: current },
      });
      expect(successors).toHaveLength(1);
      const winner = (fulfilled[0] as PromiseFulfilledResult<{ revision: { id: string } }>).value;
      expect(await currentOrphanDecisionId()).toBe(winner.revision.id);
      state.revisionId = winner.revision.id;
    });

    it('G0R-8 — CSDL chan re nhanh ngay ca khi bo qua khoa: UNIQUE, pham vi dong, hinh dang', async () => {
      const base = {
        reconciliationId: state.reconciliationId,
        kind: 'STATEMENT_LINE_ONLY' as const,
        fuelEntryId: null,
        candidateEntryIds: [],
        candidateLineIds: [],
        status: 'RESOLVED' as const,
        resolution: 'ACCEPT_SUPPLIER_AMOUNT' as const,
        resolutionNote: 'ghi thang, bo qua dich vu',
        resolvedAt: new Date(),
        resolvedBy: 'it-g0r-duong-ghi-la',
      };

      // Quyet dinh DAU TIEN da co nguoi thay the -> hang thu hai thay the no dam vao UNIQUE.
      await expect(
        prisma.transportFuelDiscrepancy.create({
          data: {
            ...base,
            statementLineId: state.orphanLineId,
            supersedesId: state.firstDecisionId,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      // Thay the mot quyet dinh cua DONG KHAC -> trigger tu choi.
      await expect(
        prisma.transportFuelDiscrepancy.create({
          data: { ...base, statementLineId: state.matchedLineId, supersedesId: state.revisionId },
        }),
      ).rejects.toThrow(/transport_fuel_discrepancy_supersession_scope/);

      // Mot hang CHUA QUYET khong thay the duoc gi -> `CHECK` hinh dang.
      await expect(
        prisma.transportFuelDiscrepancy.create({
          data: {
            ...base,
            status: 'PENDING',
            resolution: null,
            resolutionNote: null,
            resolvedAt: null,
            resolvedBy: null,
            statementLineId: state.orphanLineId,
            supersedesId: state.revisionId,
          },
        }),
      ).rejects.toThrow(/TransportFuelDiscrepancy_supersession_shape/);

      expect(await currentOrphanDecisionId()).toBe(state.revisionId);
    });

    /* ================================================================ *
     * G0R-9, G0R-10 — dong lai khong doi tien; duong chay lai so khop
     * ================================================================ */

    it('G0R-9 — dong lai khi quyet dinh moi KHONG doi tien -> phat lai ban giao so 2, Settlement khong them gi', async () => {
      const closed = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      expect(closed.handoff.id).toBe(state.handoffRevision2Id);

      await buildIngest().ingestFuelHandoff(state.reconciliationId, ACTOR);
      expect(await supplierDocuments()).toHaveLength(2);
    });

    it('G0R-10 — mo lai -> chay lai so khop -> quyet chenh lech MOI la ACCEPT -> noi chuoi -> ban so 3, ADJUSTMENT -2.000.000', async () => {
      await reconciliation.reopenReconciliation(state.reconciliationId, 'co hoa don goc', DIRECTOR);
      await reconciliation.runMatching(state.reconciliationId, ACTOR);
      const head = await currentOrphanDecisionId();

      const [fresh] = (await fuelRepo.listDiscrepancies(state.reconciliationId)).filter(
        (item) => item.status === 'PENDING' && item.statementLineId === state.orphanLineId,
      );
      expect(fresh).toBeDefined();
      const resolved = await reconciliation.resolveDiscrepancy(
        fresh!.id,
        { resolution: 'ACCEPT_SUPPLIER_AMOUNT', note: 'da doi chieu hoa don goc' },
        ACTOR,
      );
      expect(resolved.supersedesId).toBe(head);

      const closed = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      expect(closed.handoff).toMatchObject({
        revision: 3,
        supersedesId: state.handoffRevision2Id,
        acceptedAmount: 6_200_000,
      });

      await buildIngest().ingestFuelHandoff(state.reconciliationId, ACTOR);
      const documents = await supplierDocuments();
      expect(documents).toHaveLength(3);
      const adjustments = documents
        .filter((row) => row.kind === 'ADJUSTMENT')
        .map((row) => Number(row.signedAmount))
        .sort((left, right) => left - right);
      expect(adjustments).toEqual([-2_000_000, 2_000_000]);
      expect(documents.reduce((total, row) => total + Number(row.signedAmount), 0)).toBe(
        -6_200_000,
      );
    });

    it('G0R-11 — Fuel Supplier AP tach khoi Quy lai xe: khong mot dong quy nao cua lai xe fixture', async () => {
      expect(
        await prisma.transportDriverFundEntry.count({
          where: { account: { driver: { phone: { startsWith: PHONE_PREFIX } } } },
        }),
      ).toBe(0);
      const flows = new Set((await supplierDocuments()).map((row) => row.flow));
      expect([...flows]).toEqual(['FUEL_SUPPLIER']);
    });
  },
);
