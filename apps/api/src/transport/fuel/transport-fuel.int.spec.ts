import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { describeStorageError } from '../storage-conflict.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReadService } from './fuel-read.service.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { FileFuelStatementSource } from './fuel-statement-source.js';
import { FuelStatementService } from './fuel-statement.service.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from './fuel.service.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';

/**
 * T4 — MUOI BA BANG CHUNG CUA `TX-04` TREN POSTGRES THAT (Issue #86).
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT chu khong phai kho in-memory:
 *
 * Mot nua nhung gi T4 hua song o RANH GIOI voi CSDL — giao dich cua mot lan chay so khop, unique
 * hai chieu cua mot cap khop, `CHECK` dau tien/lit/odo, va trigger `INV-26`. Kho in-memory theo
 * dinh nghia khong co ranh gioi do: no se XANH ca bon du khong cai nao ton tai. Do dung la bai hoc
 * T2.1 da tra gia mot lan, va la ly do tep nay ton tai ben canh `fuel.service.spec.ts`.
 *
 * `describe.runIf` theo dung quy uoc cua repo: khong co DB thi BO QUA. Nghia la "xanh o may" khong
 * phu nhung bai nay; chung chay o job `integration` cua CI tren Postgres 16 that.
 *
 * ===========================================================================
 * DUONG DI CUA MOT PHIEU, DAY DU, KHONG MOT MANH GIA LAP NAO O TANG LUU TRU:
 *
 * ```text
 * lai xe nop phieu -> anh chung tu -> ke toan duyet -> chi phi vao gia thanh chuyen (TX-03)
 *   -> nhap bang ke cay xang -> so khop tat dinh -> quyet chenh lech -> dong ky
 *   -> ban giao cong no cho T5
 * ```
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Fuel + doi soat bang ke tren Postgres THAT — T4',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
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
    const read = new FuelReadService(fuelRepo, fuelCore);

    const CODE_PREFIX = 'IT-T4-CH';
    const PHONE_PREFIX = '0933T4';
    const PLATE_PREFIX = 'IT-T4-XE';
    const SUPPLIER_CODE = 'IT-T4-CX';

    const state = {
      supplierId: '',
      driverA: '',
      driverB: '',
      vehicleA: '',
      vehicleB: '',
      tripOwn: '',
      tripOutsourced: '',
      authUserA: 'IT-T4-user-a',
    };

    /**
     * THU TU XOA khong tuy y: khoa ngoai cua T4 chay theo mot chieu, va `TransportFuelEntry` con bi
     * tro toi tu ca `TransportFuelMatch` lan `TransportFuelDiscrepancy`. Bang cua `TX-03` phai xoa
     * TRUOC chuyen, vi mot phieu da duyet de lai mot `TransportTripExpense` that.
     */
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

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang kiem thu T4',
          code: SUPPLIER_CODE,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-08-01T00:00:00Z'),
        })
      ).id;

      state.driverA = (
        await fleet.createDriver({
          fullName: 'IT T4 Lai xe A',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: state.authUserA,
        })
      ).id;
      state.driverB = (
        await fleet.createDriver({
          fullName: 'IT T4 Lai xe B',
          phone: `${PHONE_PREFIX}B`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: null,
        })
      ).id;

      state.vehicleA = (
        await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-A`,
          vehicleClass: 'tai-5-tan',
          allowedPayloadKg: 5_000,
        })
      ).id;
      state.vehicleB = (
        await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-B`,
          vehicleClass: 'tai-5-tan',
          allowedPayloadKg: 5_000,
        })
      ).id;

      state.tripOwn = (
        await trips.create({
          code: `${CODE_PREFIX}-OWN`,
          kind: 'OWN_DIRECT',
          businessDate: '2026-08-05',
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
      state.tripOutsourced = (
        await trips.create({
          code: `${CODE_PREFIX}-EXT`,
          kind: 'EXTERNAL_CARRIER',
          businessDate: '2026-08-05',
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 9_000_000,
          distanceKm: 120,
        })
      ).id;

      await trips.assign(state.tripOwn, {
        vehicleId: state.vehicleA,
        driverId: state.driverA,
        assignedBy: 'it-t4',
        at: new Date('2026-08-05T00:00:00Z'),
      });
      await trips.assign(state.tripOutsourced, {
        vehicleId: state.vehicleB,
        driverId: state.driverB,
        assignedBy: 'it-t4',
        at: new Date('2026-08-05T00:00:00Z'),
      });
    });

    const submitOwn = (overrides: Partial<SubmitFuelEntryCommand> = {}) =>
      fuel.submitFuelEntry(
        {
          tripId: state.tripOwn,
          vehicleId: state.vehicleA,
          driverId: state.driverA,
          supplierId: state.supplierId,
          liters: '200',
          amount: 4_200_000,
          odometerKm: 100_500,
          occurredAt: '2026-08-05T06:30:00+07:00',
          businessDate: '2026-08-05',
          paymentMethod: 'SUPPLIER_ACCOUNT',
          ...overrides,
        },
        'it-t4-ke-toan',
      );

    /* ============================ 1 + 2 ============================ */

    it('P1 — lai xe ghi phieu kem anh chung tu cho chuyen cua chinh minh', async () => {
      const entry = await submitOwn({ correlationKey: 'it-t4-p1-phieu' });
      const evidence = await fuel.attachEvidence(
        entry.id,
        { locator: 'media://it-t4/anh-phieu-1.jpg', contentType: 'image/jpeg', byteSize: 51_200 },
        'it-t4-lai-xe-a',
      );

      const detail = await read.fuelEntryDetail(entry.id);
      expect(detail.entry.driverId).toBe(state.driverA);
      expect(detail.evidence).toHaveLength(1);
      expect(detail.evidence[0]?.id).toBe(evidence.id);

      const mine = await read.getMyFuelSlip(state.authUserA, entry.id);
      expect(mine.evidenceCount).toBe(1);
      // `INV-09` — khung nhin lai xe khong mang mot truong so sach nao.
      expect(Object.keys(mine)).not.toContain('costExpenseId');
    });

    it('P2 — lai xe khac khong nop ho va khong doc duoc phieu do', async () => {
      const entry = await fuelRepo.findEntryByCorrelation('it-t4-p1-phieu');
      expect(entry).not.toBeNull();

      // Doc: khong co ho so lai xe nao noi voi tai khoan nay => tu choi co ma, khong phai 500.
      await expect(read.getMyFuelSlip('IT-T4-user-la', entry?.id ?? '')).rejects.toMatchObject({
        reason: 'SELF_FUEL_SCOPE_NO_DRIVER_BINDING',
      });

      // Ghi: lai xe B chua tung duoc phan cong vao chuyen cua A.
      await expect(
        submitOwn({ driverId: state.driverB, correlationKey: 'it-t4-p2-nguoi-khac' }),
      ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_DRIVER_NOT_ASSIGNED' });
    });

    /* ============================ 3 + 4 ============================ */

    it('P3 — tieu hao 200 lit / 500 km = 40,000 L/100km, doc lai tu Postgres', async () => {
      await submitOwn({
        odometerKm: 200_000,
        occurredAt: '2026-08-10T06:00:00+07:00',
        businessDate: '2026-08-10',
        correlationKey: 'it-t4-p3-moc',
      });
      const measured = await submitOwn({
        odometerKm: 200_500,
        occurredAt: '2026-08-11T06:00:00+07:00',
        businessDate: '2026-08-11',
        correlationKey: 'it-t4-p3-do',
      });

      expect(measured.previousOdometerKm).toBe(200_000);
      expect(measured.consumptionUnits).toBe(40_000);

      // Doc THANG tu cot DB: `NUMERIC` phai giu dung gia tri, khong phai mot so thuc gan dung.
      const row = await prisma.transportFuelEntry.findUnique({ where: { id: measured.id } });
      expect(Number(row?.consumptionL100km)).toBe(40);
      expect(Number(row?.liters)).toBe(200);
    });

    it('P4 — odo khong tien: khong chia, danh dau can kiem tra, phieu VAN ghi duoc', async () => {
      const entry = await submitOwn({
        odometerKm: 200_100,
        occurredAt: '2026-08-12T06:00:00+07:00',
        businessDate: '2026-08-12',
        correlationKey: 'it-t4-p4-odo-lui',
      });

      expect(entry.consumptionUnits).toBeNull();
      expect(entry.reviewReasons).toEqual(['ODOMETER_NOT_ADVANCED']);

      const row = await prisma.transportFuelEntry.findUnique({ where: { id: entry.id } });
      expect(row?.consumptionL100km).toBeNull();
    });

    /* ========================== 11 + 12 ============================ */

    it('P11 — chuyen noi bo nhan chi phi dau DUNG MOT LAN', async () => {
      const entry = await submitOwn({
        odometerKm: 210_000,
        occurredAt: '2026-08-13T06:00:00+07:00',
        businessDate: '2026-08-13',
        amount: 3_000_000,
        correlationKey: 'it-t4-p11-mot-lan',
      });

      const verified = await fuel.verifyFuelEntry(entry.id, 'it-t4-ke-toan');
      const again = await fuel.verifyFuelEntry(entry.id, 'it-t4-ke-toan');

      expect(verified.costExpenseId).not.toBeNull();
      expect(again.costExpenseId).toBe(verified.costExpenseId);

      const expenses = await prisma.transportTripExpense.findMany({
        where: { tripId: state.tripOwn, correlationKey: `fuel:${entry.id}` },
      });
      expect(expenses).toHaveLength(1);
      expect(expenses[0]?.categoryCode).toBe('FUEL');
      expect(expenses[0]?.fundedBy).toBe('COMPANY_DIRECT');
      expect(Number(expenses[0]?.signedAmount)).toBe(3_000_000);
    });

    /**
     * `INV-04` MANH HON T3 o day: chuyen thue xe ngoai khong nhan MOT PHIEU NAO, ke ca `DECLARED`.
     *
     * T3 (`DA-T3-03`) van cho khoan `COMPANY_DIRECT` tren chuyen do vi tien tra nha xe di duong
     * `PayableDocument` cua T5. Dau thi khac: no la chi phi cua NHA XE va da nam trong gia thue.
     */
    it('P12 — chuyen thue xe ngoai tu choi phieu dau, khong hang nao duoc ghi', async () => {
      await expect(
        fuel.submitFuelEntry(
          {
            tripId: state.tripOutsourced,
            vehicleId: state.vehicleB,
            driverId: state.driverB,
            supplierId: state.supplierId,
            liters: '100',
            amount: 2_000_000,
            odometerKm: 5_000,
            occurredAt: '2026-08-05T08:00:00+07:00',
            businessDate: '2026-08-05',
            paymentMethod: 'DRIVER_CASH',
            correlationKey: 'it-t4-p12-thue-ngoai',
          },
          'it-t4-ke-toan',
        ),
      ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_TRIP_OUTSOURCED' });

      expect(
        await prisma.transportFuelEntry.count({ where: { tripId: state.tripOutsourced } }),
      ).toBe(0);
    });

    /* ==================== 5..10 — mot ky doi soat ==================== */

    /**
     * MOT KY DOI SOAT DAY DU tren du lieu that, dung de chung minh sau ket cuc so khop cung luc.
     *
     * Bang ke duoc dung bang mot chuoi CSV trong bai test (khong doc file fixture): o day dieu can
     * do la HANH VI SO KHOP tren Postgres, con viec doc file CSV/XLSX da co bo test rieng
     * (`fuel-statement-import.spec.ts`).
     */
    describe('P5..P10 — mot ky doi soat bang ke tren du lieu that', () => {
      const PERIOD = { start: '2026-09-01', end: '2026-09-30' };
      const ids = {
        exact: '',
        tolerant: '',
        ambiguousA: '',
        ambiguousB: '',
        statementId: '',
        reconciliationId: '',
      };

      beforeAll(async () => {
        // BON phieu, moi phieu phuc vu mot ket cuc so khop khac nhau.
        ids.exact = (
          await submitOwn({
            amount: 4_200_000,
            odometerKm: 300_000,
            occurredAt: '2026-09-05T06:00:00+07:00',
            businessDate: '2026-09-05',
            correlationKey: 'it-t4-p5-khop-tuyet-doi',
          })
        ).id;
        ids.tolerant = (
          await submitOwn({
            amount: 3_000_000,
            odometerKm: 300_400,
            occurredAt: '2026-09-10T06:00:00+07:00',
            businessDate: '2026-09-10',
            correlationKey: 'it-t4-p6-trong-dung-sai',
          })
        ).id;
        ids.ambiguousA = (
          await submitOwn({
            amount: 1_500_000,
            odometerKm: 300_800,
            occurredAt: '2026-09-15T06:00:00+07:00',
            businessDate: '2026-09-15',
            correlationKey: 'it-t4-p7-nhap-nhang-a',
          })
        ).id;
        ids.ambiguousB = (
          await submitOwn({
            amount: 1_500_000,
            odometerKm: 301_200,
            occurredAt: '2026-09-15T18:00:00+07:00',
            businessDate: '2026-09-15',
            correlationKey: 'it-t4-p7-nhap-nhang-b',
          })
        ).id;

        // Chi phieu DA DUYET moi vao vong so khop.
        for (const id of [ids.exact, ids.tolerant, ids.ambiguousA, ids.ambiguousB]) {
          await fuel.verifyFuelEntry(id, 'it-t4-ke-toan');
        }

        const plate = `${PLATE_PREFIX}-A`;
        const csv = [
          'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
          `${plate},2026-09-05,200,4.200.000,HD-EXACT,`,
          `${plate},2026-09-11,150,3.000.500,HD-TOL,lech 500d va 1 ngay`,
          `${plate},2026-09-15,60,1.500.000,HD-AMB,khop duoc voi hai phieu`,
          `${plate},2026-09-20,90,2.000.000,HD-ONLY,khong co phieu tuong ung`,
        ].join('\n');

        const imported = await statements.commitImport(
          {
            supplierId: state.supplierId,
            periodStart: PERIOD.start,
            periodEnd: PERIOD.end,
            filename: 'it-t4-bang-ke.csv',
            format: 'CSV',
            contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
          },
          'it-t4-ke-toan',
        );
        ids.statementId = imported.statement.id;
        ids.reconciliationId = imported.reconciliation.id;

        expect(imported.statement.acceptedCount).toBe(4);
        expect(imported.statement.rejectedCount).toBe(0);
      });

      it('P5 + P6 — khop tuyet doi va khop trong dung sai, deu tat dinh', async () => {
        const result = await reconciliation.runMatching(ids.reconciliationId, 'it-t4-ke-toan');

        const byEntry = new Map(result.matches.map((match) => [match.fuelEntryId, match]));
        expect(byEntry.get(ids.exact)).toMatchObject({
          amountDeltaVnd: 0,
          businessDateDeltaDays: 0,
          origin: 'AUTO',
        });
        expect(byEntry.get(ids.tolerant)).toMatchObject({
          amountDeltaVnd: 500,
          businessDateDeltaDays: 1,
          origin: 'AUTO',
        });

        const workspace = await read.reconciliationWorkspace(ids.reconciliationId);
        expect(
          workspace.lines.filter((line) => line.reconciliationStatus === 'MATCHED'),
        ).toHaveLength(2);
      });

      it('P7 — hai phieu cung khop mot dong: KHONG cap nao tu chon (GD-09)', async () => {
        const workspace = await read.reconciliationWorkspace(ids.reconciliationId);
        const ambiguous = workspace.discrepancies.find(
          (item) => item.kind === 'AMBIGUOUS_CANDIDATES',
        );

        expect(ambiguous).toBeDefined();
        expect(ambiguous?.status).toBe('PENDING');
        expect([...(ambiguous?.candidateEntryIds ?? [])].sort()).toEqual(
          [ids.ambiguousA, ids.ambiguousB].sort(),
        );
        // Khong mot cap nao trong so hai ung vien duoc ghi thanh cap khop.
        expect(
          workspace.matches.some((match) =>
            [ids.ambiguousA, ids.ambiguousB].includes(match.fuelEntryId),
          ),
        ).toBe(false);
      });

      it('P8 — dong bang ke khong co phieu tuong ung: chenh lech, khong tu vao cong no', async () => {
        const workspace = await read.reconciliationWorkspace(ids.reconciliationId);
        const only = workspace.discrepancies.find((item) => item.kind === 'STATEMENT_LINE_ONLY');

        expect(only).toBeDefined();
        expect(only?.status).toBe('PENDING');
        // `INV-07` — chua co ban giao cong no nao khi ky con mo.
        expect(workspace.handoff).toBeNull();
      });

      /**
       * P9 — `INV-26` o CA HAI TANG.
       *
       * Tang mien tra ve mot chenh lech co ten; tang DB tu choi bang trigger. Bai test do CA HAI,
       * vi chung chan hai duong khac nhau: mot duong di qua service, mot duong khong.
       */
      it('P9 — phieu de ra tu chinh bang ke nay khong khop voi no (INV-26)', async () => {
        const line = (await fuelRepo.listStatementLines(ids.statementId)).find(
          (item) => item.invoiceNo === 'HD-ONLY',
        );
        expect(line).toBeDefined();

        const selfSourced = await prisma.transportFuelEntry.create({
          data: {
            tripId: state.tripOwn,
            vehicleId: state.vehicleA,
            driverId: state.driverA,
            supplierId: state.supplierId,
            businessDate: '2026-09-20',
            occurredAt: new Date('2026-09-20T06:00:00Z'),
            liters: '90',
            amount: 2_000_000n,
            odometerKm: 302_000,
            reviewReasons: [],
            paymentMethod: 'SUPPLIER_ACCOUNT',
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date('2026-09-21T00:00:00Z'),
            verifiedBy: 'it-t4-ke-toan',
            // Soi day cua `INV-26`: phieu nay do CHINH bang ke dang doi soat de ra.
            sourceStatementId: ids.statementId,
            correlationKey: 'it-t4-p9-tu-nguon',
            declaredBy: 'it-t4-he-thong',
            updatedAt: new Date('2026-09-21T00:00:00Z'),
          },
        });

        // (a) Tang mien: chay lai so khop KHONG de nghi cap tu-nguon nao.
        await reconciliation.runMatching(ids.reconciliationId, 'it-t4-ke-toan');
        const workspace = await read.reconciliationWorkspace(ids.reconciliationId);
        expect(workspace.matches.some((match) => match.fuelEntryId === selfSourced.id)).toBe(false);
        expect(workspace.discrepancies.some((item) => item.kind === 'SELF_SOURCED_BLOCKED')).toBe(
          true,
        );

        // (b) Tang DB: mot duong ghi KHONG di qua service van bi trigger chan.
        let blocked = '';
        try {
          await prisma.transportFuelMatch.create({
            data: {
              reconciliationId: ids.reconciliationId,
              statementLineId: line?.id ?? '',
              fuelEntryId: selfSourced.id,
              amountDeltaVnd: 0n,
              businessDateDeltaDays: 0,
              origin: 'MANUAL',
              matchedBy: 'it-t4-ke-toan',
            },
          });
        } catch (error) {
          blocked = describeStorageError(error);
        }
        expect(blocked).toContain('TransportFuelMatch_no_self_source');
      });

      it('P10 — con chenh lech chua quyet thi KHONG dong duoc ky', async () => {
        await expect(
          reconciliation.closeReconciliation(ids.reconciliationId, 'it-t4-ke-toan'),
        ).rejects.toMatchObject({ reason: 'RECONCILIATION_HAS_PENDING_DISCREPANCY' });
      });

      it('P10 — dong ky roi thi moi chung tu bi khoa, va sua ngam bi tu choi', async () => {
        const before = await read.reconciliationWorkspace(ids.reconciliationId);
        for (const discrepancy of before.discrepancies) {
          if (discrepancy.status !== 'PENDING') continue;
          await reconciliation.resolveDiscrepancy(
            discrepancy.id,
            {
              // `ACCEPT_SUPPLIER_AMOUNT` la QUYET DINH DUY NHAT cho tien di tiep sang T5 —
              // `INV-07`/`INV-27`. Cac chenh lech con lai duoc bo qua co ly do.
              resolution:
                discrepancy.kind === 'STATEMENT_LINE_ONLY'
                  ? 'ACCEPT_SUPPLIER_AMOUNT'
                  : 'IGNORE_WITH_REASON',
              note: 'Quyet trong bai kiem thu T4',
            },
            'it-t4-ke-toan',
          );
        }

        const closed = await reconciliation.closeReconciliation(
          ids.reconciliationId,
          'it-t4-ke-toan',
        );
        expect(closed.reconciliation.state).toBe('CLOSED');
        expect(closed.handoff.acceptedLineCount).toBeGreaterThan(0);

        // Chung tu trong ky da khoa: sua ngam bi tu choi voi ma nghiep vu.
        expect((await fuelRepo.findEntry(ids.exact))?.reconciliationStatus).toBe('SETTLED');

        await expect(
          fuel.attachEvidence(
            ids.exact,
            { locator: 'media://it-t4/them-sau-khi-dong.jpg' },
            'it-t4-ke-toan',
          ),
        ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED' });

        await expect(
          reconciliation.runMatching(ids.reconciliationId, 'it-t4-ke-toan'),
        ).rejects.toMatchObject({ reason: 'RECONCILIATION_FROZEN' });
      });

      /**
       * BAN GIAO SANG T5 — PHAT LAI khi ket qua khong doi, va T4 KHONG ghi mot bang nao cua T5.
       *
       * ---------------------------------------------------------------------------
       * BAI NAY DA DUOC SUA LAI O T4R (Issue #103 §2), va cau chu cu la ly do.
       *
       * Ban truoc doi "DUNG MOT LAN, ke ca khi mo lai roi dong lai" va do bang `count === 1`. Cau
       * do dung o day — vi bai nay KHONG sua so lieu giua hai lan dong — nhung no doc len nhu mot
       * loi hua rang mot ky KHONG BAO GIO co ban giao thu hai. Loi hua do sai, va no khoa dung cai
       * hanh vi phai sua: mo lai, sua so tien, dong lai va van tra ve ban giao CU.
       *
       * Nen bai nay gio khang dinh dung cai no do duoc: KHONG DOI SO LIEU thi phat lai ban SO 1.
       * Truong hop CO doi so lieu — va phai sinh ban so 2 — nam o `transport-fuel-recovery.int.spec`.
       */
      it('ket qua khong doi: dong lai phat lai ban giao so 1, khong them ban moi', async () => {
        const first = await fuelRepo.findHandoff(ids.reconciliationId);
        expect(first).not.toBeNull();
        expect(first?.revision).toBe(1);
        expect(first?.supersedesId).toBeNull();

        await reconciliation.reopenReconciliation(
          ids.reconciliationId,
          'Cay xang gui lai bang ke bo sung',
          'it-t4-giam-doc',
        );
        const reopened = await fuelRepo.findReconciliation(ids.reconciliationId);
        expect(reopened?.state).toBe('REOPENED');
        expect(reopened?.reopenedBy).toBe('it-t4-giam-doc');

        await reconciliation.runMatching(ids.reconciliationId, 'it-t4-ke-toan');
        const workspace = await read.reconciliationWorkspace(ids.reconciliationId);
        for (const discrepancy of workspace.discrepancies) {
          if (discrepancy.status !== 'PENDING') continue;
          await reconciliation.resolveDiscrepancy(
            discrepancy.id,
            { resolution: 'IGNORE_WITH_REASON', note: 'Da quyet o lan dong truoc' },
            'it-t4-ke-toan',
          );
        }
        const closedAgain = await reconciliation.closeReconciliation(
          ids.reconciliationId,
          'it-t4-ke-toan',
        );

        expect(closedAgain.handoff.id).toBe(first?.id);
        expect(closedAgain.handoff.revision).toBe(1);
        expect(
          await prisma.transportFuelSettlementHandoff.count({
            where: { reconciliationId: ids.reconciliationId },
          }),
        ).toBe(1);
      });

      /* ============================== 13 ============================== */

      /**
       * P13 — trang thai song sot qua mot lan KHOI DONG LAI.
       *
       * Dung mot `PrismaService` MOI va mot bo repository MOI: khong mot byte nao cua tien trinh
       * truoc con trong bo nho. Neu mot phan trang thai chi ton tai trong RAM (mot bo nho dem, mot
       * `Map` o tang kho), bai test nay do — va do dung la dieu mot kho in-memory khong bao gio noi
       * cho ta biet.
       */
      it('P13 — doc lai bang mot ket noi MOI cho ra dung trang thai da chot', async () => {
        const freshPrisma = new PrismaService();
        const freshRepo = new PrismaFuelRepository(freshPrisma);
        const freshRead = new FuelReadService(
          freshRepo,
          new TransportFuelCoreFactsAdapter(
            new PrismaTripRepository(freshPrisma),
            new PrismaFleetRepository(freshPrisma),
          ),
        );

        try {
          const workspace = await freshRead.reconciliationWorkspace(ids.reconciliationId);

          expect(workspace.reconciliation.state).toBe('CLOSED');
          expect(workspace.pendingDiscrepancyCount).toBe(0);
          expect(workspace.handoff).not.toBeNull();
          expect(workspace.statement.acceptedCount).toBe(4);

          const entry = await freshRepo.findEntry(ids.exact);
          expect(entry?.verificationStatus).toBe('VERIFIED');
          expect(entry?.reconciliationStatus).toBe('SETTLED');
          expect(entry?.costExpenseId).not.toBeNull();
          // So lit doc lai tu `NUMERIC` van la dung so nguyen co ty le ban dau.
          expect(entry?.litersUnits).toBe(200_000);
        } finally {
          await freshPrisma.$disconnect();
        }
      });
    });
  },
);
