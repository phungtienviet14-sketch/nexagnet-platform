import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { FileFuelStatementSource } from './fuel-statement-source.js';
import { FuelStatementService } from './fuel-statement.service.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import { FuelService } from './fuel.service.js';
import type { FuelEntry } from './fuel.types.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';

/**
 * T4R §1 va §4 — HAI LENH CUNG CHAY, VA CHI MOT KET CUC DOC DUOC (Issue #103).
 *
 * ===========================================================================
 * VI SAO BO TEST NAY PHAI TON TAI RIENG.
 *
 * `transport-fuel.int.spec.ts` chung minh mot LUOT CHAY DUNG tren Postgres that: phieu -> duyet ->
 * bang ke -> so khop -> dong ky. No chay MOT luong, va mot luong thi khong bao gio va vao chinh no.
 *
 * Nhung hai loi P0 cua ban ra soat #103 chi hien ra khi CO HAI. Chung khong phai loi logic — moi
 * dong code deu dung khi doc mot minh — chung la loi THU TU:
 *
 * ```text
 * §1  A doc ky dang RESOLVED
 *     B dong ky -> CLOSED, phat ban giao cong no cho T5
 *     A ghi de bo cap khop  => ban giao vua phat mo ta mot bo ket qua khong con ton tai
 *
 * §4  A doc phieu dang DECLARED
 *     B duyet phieu -> VERIFIED, day chi phi that vao gia thanh chuyen o `TX-03`
 *     A ghi de so tien      => phieu bat bien lech voi khoan chi da vao so
 * ```
 *
 * Mot kho trong bo nho khong the do dieu nay: no chay mot luong, khong co khoa hang, va se XANH ca
 * hai bai du khong co gi duoc sua. Do la ly do moi bai duoi day deu chay tren Postgres THAT.
 *
 * ===========================================================================
 * CACH TAM DUNG MOT LENH GIUA CHUNG — `GatedFuelRepository`.
 *
 * De do duoc mot va cham, mot ben phai DUNG LAI o dung cho no da doc xong ma chua ghi. Khong co
 * cach nao lam viec do tu ben ngoai mot loi goi service, nen o day dung mot LOP CON cua kho that:
 * no goi `super` cho moi thu, va chi cho MOT phep doc duoc chon truoc di qua mot cong.
 *
 * Quan trong: day KHONG phai mot mock. Ma chay ben duoi van la `PrismaFuelRepository` that, giao
 * dich that, khoa that. Cong chi quyet dinh KHI NAO lenh di tiep — dung thu ma bai test can dieu
 * khien va la thu duy nhat no dieu khien.
 */

/*
 * TIEN TO PHAI KHONG LA TIEN TO CUA AI KHAC — mot bai hoc phai tra gia mot lan.
 *
 * Cac tep IT chay SONG SONG tren CUNG mot database, va moi tep don dep du lieu cua no bang
 * `startsWith`. `transport-fuel.int.spec.ts` xoa lai xe co so dien thoai bat dau bang `0933T4`;
 * neu tep nay dung `0933T4RC`, lan don dep cua tep KIA se xoa mat lai xe cua tep NAY giua chung —
 * va loi hien ra thanh mot vi pham khoa ngoai khong lien quan gi den cai dang duoc do.
 *
 * Nen so dien thoai o day bat dau bang `0934`, khong nam duoi bat cu tien to nao dang dung.
 */
const CODE_PREFIX = 'IT-T4RC-CH';
const PHONE_PREFIX = '0934RC';
const PLATE_PREFIX = 'IT-T4RC-XE';
const SUPPLIER_CODE = 'IT-T4RC-CX';

type GatePoint = 'listMatches' | 'findReconciliation' | 'findPreviousOdometer' | 'findEntry';

class GatedFuelRepository extends PrismaFuelRepository {
  private gate: Promise<void> | null = null;
  private gateAt: GatePoint = 'listMatches';

  /** Mo mot cong o `at`; tra ve ham THA cong do. Cong chi bat MOT lan. */
  arm(at: GatePoint): () => void {
    let release = (): void => {};
    this.gateAt = at;
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  private async pause(at: GatePoint): Promise<void> {
    if (this.gateAt !== at || !this.gate) return;
    const gate = this.gate;
    this.gate = null;
    await gate;
  }

  override async listMatches(reconciliationId: string) {
    await this.pause('listMatches');
    return super.listMatches(reconciliationId);
  }

  override async findReconciliation(id: string) {
    await this.pause('findReconciliation');
    return super.findReconciliation(id);
  }

  override async findPreviousOdometer(
    input: Parameters<PrismaFuelRepository['findPreviousOdometer']>[0],
  ) {
    await this.pause('findPreviousOdometer');
    return super.findPreviousOdometer(input);
  }

  /**
   * Cong nay dat SAU phep doc, khong truoc.
   *
   * Cac cong kia dung lai TRUOC de lenh doc du lieu MOI. Cong nay thi nguoc lai: bai C6 can lenh
   * gan bang chung doc duoc trang thai CU (`MATCHED`, con gan duoc), roi moi dung lai — do dung la
   * cua so ma mot lenh dong ky chen vao duoc.
   */
  override async findEntry(id: string) {
    const entry = await super.findEntry(id);
    await this.pause('findEntry');
    return entry;
  }
}

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'T4R — hai lenh cung cham mot ky doi soat tren Postgres THAT',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
    const gatedRepo = new GatedFuelRepository(prisma);
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
      new PrismaCostingRepository(prisma),
      new TransportCoreFactsAdapter(trips, fleet),
      audit,
      CORE_POLICY,
      COSTING_POLICY,
    );
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const costingPort = new CostingFuelExpenseAdapter(costing);

    const fuel = new FuelService(fuelRepo, fuelCore, costingPort, audit, CORE_POLICY, FUEL_POLICY);
    const gatedFuel = new FuelService(
      gatedRepo,
      fuelCore,
      costingPort,
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
    const gatedReconciliation = new FuelReconciliationService(gatedRepo, audit, FUEL_POLICY);

    const state = { supplierId: '', driverId: '', vehicleId: '', tripId: '' };
    let serial = 0;

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: SUPPLIER_CODE } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);
      const reconciliations = await prisma.transportFuelReconciliation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const reconciliationIds = reconciliations.map((row) => row.id);

      // Ban giao phai xoa theo `revision` GIAM DAN: `supersedesId` la khoa ngoai `ON DELETE
      // RESTRICT`, nen ban 1 khong xoa duoc trong khi ban 2 con tro vao no.
      await prisma.transportFuelSettlementHandoff.deleteMany({
        where: { reconciliationId: { in: reconciliationIds }, revision: { gt: 1 } },
      });
      await prisma.transportFuelSettlementHandoff.deleteMany({
        where: { reconciliationId: { in: reconciliationIds } },
      });
      await prisma.transportFuelMatch.deleteMany({
        where: { reconciliationId: { in: reconciliationIds } },
      });
      await prisma.transportFuelDiscrepancy.deleteMany({
        where: { reconciliationId: { in: reconciliationIds } },
      });
      await prisma.transportFuelReconciliation.deleteMany({
        where: { id: { in: reconciliationIds } },
      });

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

    /**
     * MOT KET NOI RIENG, DUNG MOT BACKEND — de bai test hoi duoc "phien NAY co dang cho khoa khong",
     * chu khong phai "co ai do trong CSDL dang cho khoa khong".
     *
     * Cau hoi thu hai la cai bay: CI chay nhieu tep test song song tren CUNG mot database, nen
     * `pg_stat_activity` gan nhu luc nao cung co mot phien khac dang cho mot khoa khong lien quan.
     * `connection_limit=1` ep pool ve DUNG mot backend, nen `pg_backend_pid()` doc mot lan la dung
     * mai. Cung ly le voi `transport-costing.int.spec.ts` — xem khoi chu thich o do.
     */
    const soloUrl = (() => {
      const base = process.env.DATABASE_URL ?? '';
      return `${base}${base.includes('?') ? '&' : '?'}connection_limit=1`;
    })();
    const soloPrisma = new PrismaService({ datasourceUrl: soloUrl });
    const soloReconciliation = new FuelReconciliationService(
      new PrismaFuelRepository(soloPrisma),
      audit,
      FUEL_POLICY,
    );
    let soloPid = 0;

    async function waitUntilBlocked(pid: number): Promise<void> {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_stat_activity
          WHERE pid = ${pid} AND wait_event_type = 'Lock'`;
        if (Number(rows[0]?.n ?? 0) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Phien ${pid} khong vao hang doi khoa`);
    }

    beforeAll(async () => {
      await cleanup();
      const rows = await soloPrisma.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      soloPid = Number(rows[0]?.pid ?? 0);
      expect(soloPid).toBeGreaterThan(0);

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang T4R',
          code: SUPPLIER_CODE,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-08-01T00:00:00Z'),
        })
      ).id;
      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT T4RC Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: null,
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
          businessDate: '2026-09-01',
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
        assignedBy: 'it-t4rc',
        at: new Date('2026-09-01T00:00:00Z'),
      });
    });

    afterAll(async () => {
      await soloPrisma.$disconnect();
      await cleanup();
    });

    /** Mot phieu MOI, chua duyet — moi bai tu lo phieu cua no de khong bai nao phu thuoc bai truoc. */
    async function freshEntry(amount = 4_200_000): Promise<FuelEntry> {
      serial += 1;
      const day = `2026-09-${String((serial % 27) + 1).padStart(2, '0')}`;
      return fuel.submitFuelEntry(
        {
          tripId: state.tripId,
          vehicleId: state.vehicleId,
          driverId: state.driverId,
          supplierId: state.supplierId,
          liters: '200',
          amount,
          odometerKm: 100_000 + serial * 1_000,
          occurredAt: `${day}T06:30:00+07:00`,
          businessDate: day,
          paymentMethod: 'SUPPLIER_ACCOUNT',
          correlationKey: `it-t4rc-${serial}`,
        },
        'it-t4rc-ke-toan',
      );
    }

    /**
     * MOT KY DOI SOAT DA CHAY SO KHOP, khong con cau hoi treo — tuc DUNG O `RESOLVED`.
     *
     * Day la diem xuat phat cua moi bai §1: no la trang thai duy nhat ma CA HAI lenh (chay lai so
     * khop, va dong ky) deu hop le, nen no la cho duy nhat hai lenh do co the va vao nhau.
     */
    async function resolvedPeriod(): Promise<{
      reconciliationId: string;
      statementId: string;
      entry: FuelEntry;
    }> {
      serial += 1;
      const day = `2026-11-${String((serial % 27) + 1).padStart(2, '0')}`;
      /*
       * MOI KY MOT CAY XANG RIENG — khong phai trang tri.
       *
       * `listEntriesForMatching` loc theo cay xang VA mot khoang ngay DA NOI RONG theo dung sai
       * (`GD-08`). Neu moi ky dung chung mot cay xang, phieu cua ky truoc se roi vao vong so khop
       * cua ky sau va sinh ra `FUEL_ENTRY_ONLY` — bai test se do vi mot ly do khong lien quan gi
       * den cai no dang do. Tach cay xang la cach cach ly RE nhat va dung nghia nghiep vu nhat.
       */
      const supplierId = (
        await fuelRepo.createSupplier({
          name: `Cay xang T4R ky ${serial}`,
          code: `${SUPPLIER_CODE}-${serial}`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-08-01T00:00:00Z'),
        })
      ).id;
      const entry = await fuel.submitFuelEntry(
        {
          tripId: state.tripId,
          vehicleId: state.vehicleId,
          driverId: state.driverId,
          supplierId,
          liters: '200',
          amount: 4_200_000,
          odometerKm: 500_000 + serial * 1_000,
          occurredAt: `${day}T06:30:00+07:00`,
          businessDate: day,
          paymentMethod: 'SUPPLIER_ACCOUNT',
          correlationKey: `it-t4rc-period-${serial}`,
        },
        'it-t4rc-ke-toan',
      );
      await fuel.verifyFuelEntry(entry.id, 'it-t4rc-ke-toan');

      const csv = [
        'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
        `${PLATE_PREFIX}-A,${day},200,4.200.000,HD-T4RC-${serial},`,
      ].join('\n');
      const imported = await statements.commitImport(
        {
          supplierId,
          periodStart: day,
          periodEnd: day,
          filename: `t4rc-${serial}.csv`,
          format: 'CSV',
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        },
        'it-t4rc-ke-toan',
      );

      await reconciliation.runMatching(imported.reconciliation.id, 'it-t4rc-ke-toan');
      const after = await fuelRepo.findReconciliation(imported.reconciliation.id);
      expect(after?.state).toBe('RESOLVED');

      return {
        reconciliationId: imported.reconciliation.id,
        statementId: imported.statement.id,
        entry,
      };
    }

    /** Anh chup MOI thu mot lan chay so khop co the ghi vao — de doi chieu "da doi hay chua". */
    async function snapshot(reconciliationId: string, statementId: string) {
      return {
        matches: await prisma.transportFuelMatch.findMany({
          where: { reconciliationId },
          orderBy: { id: 'asc' },
        }),
        discrepancies: await prisma.transportFuelDiscrepancy.findMany({
          where: { reconciliationId },
          orderBy: { id: 'asc' },
        }),
        lines: await prisma.transportFuelStatementLine.findMany({
          where: { statementId },
          orderBy: { id: 'asc' },
          select: { id: true, reconciliationStatus: true },
        }),
      };
    }

    beforeEach(() => {
      // Moi bai tu mo cong cua no; khong bai nao duoc thua mot cong con mo cua bai truoc.
      gatedRepo.arm('listMatches')();
    });

    /* ================================================================ *
     * §1 — SO KHOP va DONG KY xep hang voi nhau
     * ================================================================ */

    describe('§1 — so khop va dong ky di qua CUNG mot hang doi', () => {
      /**
       * C1 — SO KHOP TRUOC: lenh dong PHAI DOI, va ban giao mo ta ket qua CUOI CUNG.
       *
       * Ben giu khoa la SQL THO co chu dich, va no lam DUNG hai buoc dau tien ma
       * `applyMatchingRun()` that lam: `SELECT ... FOR UPDATE` tren hang doi soat, roi ghi. Dung SQL
       * tho vi bai test can giu giao dich do MO trong luc lenh dong xep hang phia sau — mot loi goi
       * service khong dung yen giua chung duoc.
       *
       * Ben dang duoc kiem la MA THAT: `closeReconciliation()` phai doi khoa, roi doc DUOC hang vua
       * commit va tinh tong tren du lieu do.
       */
      it('C1 — so khop giu khoa truoc: lenh dong DOI, roi thay ket qua CUOI CUNG', async () => {
        const period = await resolvedPeriod();
        const before = await snapshot(period.reconciliationId, period.statementId);
        expect(before.matches).toHaveLength(1);

        let releaseWriter = (): void => {};
        const writerGate = new Promise<void>((resolve) => {
          releaseWriter = resolve;
        });
        const writer = prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT "id" FROM "TransportFuelReconciliation" WHERE "id" = ${period.reconciliationId} FOR UPDATE`;
            // Go cap khop tu dong: sau lan nay ky KHONG con dong nao duoc chap nhan.
            await tx.transportFuelMatch.deleteMany({
              where: { reconciliationId: period.reconciliationId, origin: 'AUTO' },
            });
            await writerGate;
          },
          { timeout: 60_000, maxWait: 30_000 },
        );

        const closing = soloReconciliation.closeReconciliation(
          period.reconciliationId,
          'it-t4rc-ke-toan',
        );
        await waitUntilBlocked(soloPid);

        releaseWriter();
        await writer;
        const closed = await closing;

        // Ban giao KHONG duoc mo ta bo cap khop cu: no phai doc ket qua sau lan ghi kia.
        expect(closed.handoff.acceptedLineCount).toBe(0);
        expect(closed.handoff.acceptedAmount).toBe(0);
        expect(closed.handoff.acceptedLineIds).toEqual([]);
      });

      /**
       * C2 — DONG KY TRUOC: lan so khop doi DUNG KHONG hang nao, va bao mot va cham CO MA.
       *
       * Day la ket cuc ma ban ra soat goi ten: truoc T4R, lan so khop van ghi de bo cap khop, roi
       * moi that bai o buoc doi trang thai — de lai mot ky DA DONG mang mot ket qua khac voi cai da
       * bao cao ra ngoai.
       *
       * Cong `listMatches` dat lan chay so khop DUNG o cho no da doc xong ma chua ghi — chinh xac
       * cua so ma loi cu roi vao.
       */
      it('C2 — dong ky truoc: lan so khop doi DUNG KHONG hang nao', async () => {
        const period = await resolvedPeriod();
        const before = await snapshot(period.reconciliationId, period.statementId);

        const release = gatedRepo.arm('listMatches');
        const matching = gatedReconciliation
          .runMatching(period.reconciliationId, 'it-t4rc-ke-toan')
          .then(() => 'DA GHI' as const)
          .catch((error: { reason?: string }) => error.reason ?? 'LOI LA');

        // Trong luc lan so khop dung o cong, ky duoc dong bang MA THAT.
        const closed = await reconciliation.closeReconciliation(
          period.reconciliationId,
          'it-t4rc-ke-toan',
        );
        expect(closed.reconciliation.state).toBe('CLOSED');

        release();
        expect(await matching).toBe('RECONCILIATION_FROZEN');

        // KHONG MOT CAP KHOP / CHENH LECH NAO doi.
        const after = await snapshot(period.reconciliationId, period.statementId);
        expect(after.matches).toEqual(before.matches);
        expect(after.discrepancies).toEqual(before.discrepancies);

        // Va ban giao van mo ta dung bo cap khop cua luc dong.
        const handoff = await fuelRepo.findHandoff(period.reconciliationId);
        expect(handoff?.acceptedLineIds).toEqual(before.matches.map((m) => m.statementLineId));
      });

      /**
       * C3 — KHONG BAO GIO co mot ky DA DONG mang mot cau hoi chua ai tra loi.
       *
       * Truoc T4R phep dem chenh lech treo chay o tang mien, TRUOC giao dich dong ky. Mot lan chay
       * so khop chen vao giua sinh ra mot chenh lech `PENDING` moi ma lenh dong khong bao gio thay.
       *
       * Cong `findReconciliation` dat lenh dong DUNG o cho no vua di qua phep kiem dau tien ma chua
       * mo giao dich. Neu phep dem van con o ngoai, bai nay se dong duoc ky — va do la loi.
       */
      it('C3 — chenh lech moi sinh ra truoc khi dong: lenh dong TU CHOI', async () => {
        const period = await resolvedPeriod();

        const release = gatedRepo.arm('findReconciliation');
        const closing = gatedReconciliation
          .closeReconciliation(period.reconciliationId, 'it-t4rc-ke-toan')
          .then(() => 'DA DONG' as const)
          .catch((error: { reason?: string }) => error.reason ?? 'LOI LA');

        // Trong luc lenh dong dung o cong: mot cau hoi treo moi xuat hien.
        await prisma.transportFuelDiscrepancy.create({
          data: {
            reconciliationId: period.reconciliationId,
            kind: 'FUEL_ENTRY_ONLY',
            statementLineId: null,
            fuelEntryId: period.entry.id,
            candidateEntryIds: [],
            candidateLineIds: [],
          },
        });

        release();
        expect(await closing).toBe('RECONCILIATION_HAS_PENDING_DISCREPANCY');

        const stored = await fuelRepo.findReconciliation(period.reconciliationId);
        expect(stored?.state).not.toBe('CLOSED');
        expect(await fuelRepo.findHandoff(period.reconciliationId)).toBeNull();
      });
    });

    /* ================================================================ *
     * §4 — DUYET va SUA khong duoc di qua nhau
     * ================================================================ */

    describe('§4 — duyet va sua tren cung mot phieu', () => {
      /**
       * C4 — DUYET THANG: lan sua bi tu choi, va phieu `VERIFIED` khop voi khoan chi da vao `TX-03`.
       *
       * Cong `findPreviousOdometer` dat lan sua DUNG giua hai viec: no da doc phieu (thay
       * `DECLARED`, cho phep sua) va chua ghi. Truoc T4R, lenh ghi la `UPDATE ... WHERE id` va se
       * THANH CONG o day — de lai mot phieu bat bien lech voi so tien da nam trong gia thanh chuyen.
       */
      it('C4 — duyet thang: lan sua bi tu choi, phieu VERIFIED khop voi khoan chi', async () => {
        const entry = await freshEntry(4_200_000);

        const release = gatedRepo.arm('findPreviousOdometer');
        const amending = gatedFuel
          .amendFuelEntry(
            entry.id,
            {
              liters: '200',
              amount: 9_900_000,
              odometerKm: entry.odometerKm,
              occurredAt: entry.occurredAt,
              businessDate: entry.businessDate,
              supplierId: state.supplierId,
              paymentMethod: 'SUPPLIER_ACCOUNT',
            },
            'it-t4rc-lai-xe',
          )
          .then(() => 'DA SUA' as const)
          .catch((error: { reason?: string }) => error.reason ?? 'LOI LA');

        const verified = await fuel.verifyFuelEntry(entry.id, 'it-t4rc-ke-toan');
        expect(verified.verificationStatus).toBe('VERIFIED');

        release();
        expect(await amending).toBe('FUEL_ENTRY_AMEND_STATE_RACE');

        const stored = await fuelRepo.findEntry(entry.id);
        expect(stored?.amount).toBe(4_200_000);
        expect(stored?.costExpenseId).not.toBeNull();

        // Va con so DA VAO gia thanh chuyen dung bang con so tren phieu bat bien.
        const expense = await prisma.transportTripExpense.findUniqueOrThrow({
          where: { id: stored!.costExpenseId! },
        });
        expect(Number(expense.signedAmount)).toBe(stored?.amount);
      });

      /**
       * C5 — SUA THANG: lenh duyet sau do day DUNG con so da sua vao gia thanh chuyen.
       *
       * Nua con lai cua C4, va khong can cong nao: mot lan sua da commit thi lenh duyet doc ra du
       * lieu moi. Bai nay ton tai de chan mot "ban sua" de dai — khoa chat den muc mot lan sua HOP
       * LE cung bi tu choi se lam bai nay do.
       */
      it('C5 — sua thang: lenh duyet day DUNG con so da sua vao TX-03', async () => {
        const entry = await freshEntry(4_200_000);

        const amended = await fuel.amendFuelEntry(
          entry.id,
          {
            liters: '200',
            amount: 5_500_000,
            odometerKm: entry.odometerKm,
            occurredAt: entry.occurredAt,
            businessDate: entry.businessDate,
            supplierId: state.supplierId,
            paymentMethod: 'SUPPLIER_ACCOUNT',
          },
          'it-t4rc-lai-xe',
        );
        expect(amended.amount).toBe(5_500_000);

        const verified = await fuel.verifyFuelEntry(entry.id, 'it-t4rc-ke-toan');
        const expense = await prisma.transportTripExpense.findUniqueOrThrow({
          where: { id: verified.costExpenseId! },
        });
        expect(Number(expense.signedAmount)).toBe(5_500_000);
      });

      /**
       * C6 — BANG CHUNG cung theo dung luat do (`GD-11`).
       *
       * Ban ra soat viet ro: "ap cung nguyen tac kiem-luc-ghi cho viec gan bang chung neu
       * `CLOSED`/`SETTLED` duoc coi la dong bang bang chung". Mot tam anh khong doi mot con so nao,
       * nhung no la CHUNG TU cua mot ky da bao cao ra ngoai.
       */
      it('C6 — gan anh trong luc ky dang dong: bi tu choi, khong hang nao duoc ghi', async () => {
        const period = await resolvedPeriod();
        const before = await prisma.transportFuelReceiptEvidence.count({
          where: { fuelEntryId: period.entry.id },
        });

        const release = gatedRepo.arm('findEntry');
        const attaching = gatedFuel
          .attachEvidence(
            period.entry.id,
            { locator: 'media://it-t4rc/anh-chen-giua.jpg' },
            'it-t4rc-ke-toan',
          )
          .then(() => 'DA GAN' as const)
          .catch((error: { reason?: string }) => error.reason ?? 'LOI LA');

        await reconciliation.closeReconciliation(period.reconciliationId, 'it-t4rc-ke-toan');

        release();
        expect(await attaching).toBe('FUEL_ENTRY_AMEND_STATE_RACE');
        expect(
          await prisma.transportFuelReceiptEvidence.count({
            where: { fuelEntryId: period.entry.id },
          }),
        ).toBe(before);
      });
    });
  },
);
