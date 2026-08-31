import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { PrismaFuelRepository } from './prisma-fuel.repository.js';

/**
 * T4R §2 va §3 — MOT LAN GHI HONG KHONG DUOC DE LAI MANH VUN, VA MOT LAN SUA PHAI DEN DUOC T5.
 *
 * ===========================================================================
 * §3 — CACH BAI TEST LAM CHO MOT GIAO DICH HONG DUNG CHO NO CAN.
 *
 * Ban ra soat doi mot bang chung rat cu the: "hong SAU khi ghi cac dong nhung TRUOC khi tao ky doi
 * soat phai quay lui tat ca; lan nhap lai sau do phai thanh cong". De do duoc, lan ghi phai that
 * bai o DUNG mot diem — va khong dau vao nghiep vu hop le nao lam duoc dieu do (neu co, do la mot
 * loi khac han).
 *
 * Nen o day dung `$extends` cua Prisma: mot ban sao cua client that, giong het, chi khac dung mot
 * dieu — lenh `create` tren bang doi soat nem. Ban sao do duoc dua vao `PrismaFuelRepository` that.
 * Giao dich la that, thu tu ghi la that, va lan quay lui la cua PostgreSQL chu khong phai cua bai
 * test.
 *
 * Vi sao khong mo mot cua sau trong ma san xuat: mot diem ngat chi ton tai de test se song mai, va
 * lan sau se co nguoi dung no cho viec khac. Lop mo rong nay chi song trong tep nay.
 *
 * ===========================================================================
 * §2 — VI SAO PHAI DO TREN POSTGRES CHU KHONG PHAI KHO TRONG BO NHO.
 *
 * Chuoi ban sua doi song bang hai rang buoc CUA CSDL: `@@unique([reconciliationId, revision])` va
 * khoa ngoai tu tham chieu `supersedesId`. Kho trong bo nho khong co cai nao, nen no se xanh ca khi
 * ca hai bien mat. Cac bai duoi day doc CHINH cac hang trong bang, khong doc gia tri tra ve.
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
const CODE_PREFIX = 'IT-T4RR-CH';
const PHONE_PREFIX = '0934RR';
const PLATE_PREFIX = 'IT-T4RR-XE';
const SUPPLIER_CODE = 'IT-T4RR-CX';

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'T4R — nguyen tu khi nhap bang ke, va chuoi ban giao khi so lieu doi',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
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

    const state = { driverId: '', vehicleId: '', tripId: '' };
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

      // Ban sau tro nguoc ve ban truoc bang mot khoa ngoai `ON DELETE RESTRICT`, nen phai xoa tu
      // ban MOI NHAT tro ve. `revision` giam dan la thu tu duy nhat chay duoc.
      const revisions = await prisma.transportFuelSettlementHandoff.findMany({
        where: { reconciliationId: { in: reconciliationIds } },
        orderBy: { revision: 'desc' },
        select: { id: true },
      });
      for (const row of revisions) {
        await prisma.transportFuelSettlementHandoff.delete({ where: { id: row.id } });
      }

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
      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT T4RR Lai xe',
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
          destinationLabel: 'Hai Phong',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 9_000_000,
          distanceKm: 120,
        })
      ).id;
      await trips.assign(state.tripId, {
        vehicleId: state.vehicleId,
        driverId: state.driverId,
        assignedBy: 'it-t4rr',
        at: new Date('2026-09-01T00:00:00Z'),
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    async function freshSupplier(): Promise<string> {
      serial += 1;
      return (
        await fuelRepo.createSupplier({
          name: `Cay xang T4RR ${serial}`,
          code: `${SUPPLIER_CODE}-${serial}`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-08-01T00:00:00Z'),
        })
      ).id;
    }

    /* ================================================================ *
     * §3 — BANG KE + CAC DONG + KY DOI SOAT LA MOT LAN GHI
     * ================================================================ */

    describe('§3 — nhap bang ke la MOT giao dich', () => {
      const DAY = '2026-12-01';

      function statementCommand(supplierId: string) {
        const csv = [
          'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
          `${PLATE_PREFIX}-A,${DAY},200,4.200.000,HD-T4RR-1,`,
          `${PLATE_PREFIX}-A,${DAY},150,3.000.000,HD-T4RR-2,`,
        ].join('\n');
        return {
          supplierId,
          periodStart: DAY,
          periodEnd: DAY,
          filename: 't4rr-nguyen-tu.csv',
          format: 'CSV' as const,
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        };
      }

      /**
       * R1 — HONG SAU KHI GHI CAC DONG: khong mot manh vun nao o lai, va lan nhap lai THANH CONG.
       *
       * Truoc T4R day la hai lan ghi noi tiep, va mot lan hong o giua de lai dau bang ke + cac dong
       * MA KHONG CO ky doi soat. Trang thai do khong lam gi duoc bang giao dien, va lan nhap lai bi
       * unique `(cay xang, ky)` chan — nguoi dung ket o mot cho khong co duong ra.
       */
      it('R1 — lenh tao ky doi soat nem: bang ke va CAC DONG deu quay lui', async () => {
        const supplierId = await freshSupplier();

        // Ban sao cua client that, khac DUNG mot dieu. Xem khoi chu thich dau tep.
        const faulty = prisma.$extends({
          query: {
            transportFuelReconciliation: {
              async create() {
                throw new Error('T4RR: mo phong mot lan chet giua giao dich');
              },
            },
          },
        }) as unknown as PrismaService;

        const faultyStatements = new FuelStatementService(
          new PrismaFuelRepository(faulty),
          new FileFuelStatementSource(),
          fuelCore,
          audit,
          FUEL_POLICY,
        );

        await expect(
          faultyStatements.commitImport(statementCommand(supplierId), 'it-t4rr-ke-toan'),
        ).rejects.toThrow(/mo phong mot lan chet/);

        // KHONG mot hang nao o lai — ke ca cac dong da duoc ghi TRUOC diem hong.
        expect(await prisma.transportFuelSupplierStatement.count({ where: { supplierId } })).toBe(
          0,
        );
        expect(
          await prisma.transportFuelStatementLine.count({ where: { statement: { supplierId } } }),
        ).toBe(0);
        expect(await prisma.transportFuelReconciliation.count({ where: { supplierId } })).toBe(0);

        // Va vi khong con manh vun nao, lan nhap lai di qua duoc unique `(cay xang, ky)`.
        const retried = await statements.commitImport(
          statementCommand(supplierId),
          'it-t4rr-ke-toan',
        );
        expect(retried.lines).toHaveLength(2);
        expect(retried.reconciliation.statementId).toBe(retried.statement.id);
        expect(retried.reconciliation.state).toBe('DRAFT');
      });

      /**
       * R2 — CONG DUOC DAT BANG CAU TRUC, khong bang ky luat.
       *
       * `FuelRepository` khong con mot ham nao tao ky doi soat mot minh. Do la cai giu cho loi tren
       * khong quay lai: mot nguoi viet duong ghi thu hai se khong TIM THAY ham de goi.
       */
      it('R2 — hop dong kho KHONG con duong tao ky doi soat rieng le', () => {
        const surface = Object.getOwnPropertyNames(PrismaFuelRepository.prototype);
        expect(surface).toContain('createStatementWithReconciliation');
        expect(surface).not.toContain('createReconciliation');
      });
    });

    /* ================================================================ *
     * §2 — CHUOI BAN SUA DOI CUA BAN GIAO
     * ================================================================ */

    describe('§2 — mo lai, sua so lieu, dong lai', () => {
      const DAY = '2026-12-10';
      let supplierId = '';
      let reconciliationId = '';
      let statementId = '';
      let firstHandoffId = '';

      /** Ky co HAI dong: mot dong khop voi phieu, mot dong khong co phieu nao tuong ung. */
      beforeAll(async () => {
        supplierId = await freshSupplier();
        const entry = await fuel.submitFuelEntry(
          {
            tripId: state.tripId,
            vehicleId: state.vehicleId,
            driverId: state.driverId,
            supplierId,
            liters: '200',
            amount: 4_200_000,
            odometerKm: 700_000,
            occurredAt: `${DAY}T06:30:00+07:00`,
            businessDate: DAY,
            paymentMethod: 'SUPPLIER_ACCOUNT',
            correlationKey: 'it-t4rr-revision',
          },
          'it-t4rr-ke-toan',
        );
        await fuel.verifyFuelEntry(entry.id, 'it-t4rr-ke-toan');

        const csv = [
          'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
          `${PLATE_PREFIX}-A,${DAY},200,4.200.000,HD-KHOP,`,
          `${PLATE_PREFIX}-A,${DAY},150,3.000.000,HD-LE,khong co phieu tuong ung`,
        ].join('\n');
        const imported = await statements.commitImport(
          {
            supplierId,
            periodStart: DAY,
            periodEnd: DAY,
            filename: 't4rr-ban-sua-doi.csv',
            format: 'CSV',
            contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
          },
          'it-t4rr-ke-toan',
        );
        reconciliationId = imported.reconciliation.id;
        statementId = imported.statement.id;
      });

      /** Quyet MOI cau hoi con treo cua ky bang mot cach da chon. */
      async function resolveAllPending(
        resolution: 'IGNORE_WITH_REASON' | 'ACCEPT_SUPPLIER_AMOUNT',
      ): Promise<void> {
        for (const item of await fuelRepo.listDiscrepancies(reconciliationId)) {
          if (item.status !== 'PENDING') continue;
          await reconciliation.resolveDiscrepancy(
            item.id,
            { resolution, note: `Quyet trong bai T4RR (${resolution})` },
            'it-t4rr-ke-toan',
          );
        }
      }

      it('R3 — lan dong DAU TIEN phat ban sua doi so 1', async () => {
        await reconciliation.runMatching(reconciliationId, 'it-t4rr-ke-toan');
        await resolveAllPending('IGNORE_WITH_REASON');

        const closed = await reconciliation.closeReconciliation(
          reconciliationId,
          'it-t4rr-ke-toan',
        );
        firstHandoffId = closed.handoff.id;

        expect(closed.handoff.revision).toBe(1);
        expect(closed.handoff.supersedesId).toBeNull();
        // Chi dong DA KHOP duoc tinh tien — dong `HD-LE` bi bo qua co ly do (`INV-07`).
        expect(closed.handoff.acceptedAmount).toBe(4_200_000);
        expect(closed.handoff.acceptedLineCount).toBe(1);
      });

      /**
       * R4 — MO LAI ROI DONG LAI MA KHONG SUA GI: phat lai ban cu, KHONG them hang nao.
       *
       * Day la nghia dung cua "idempotent" o day, va la thu bai test cu da do — nhung bai cu DUNG
       * LAI o day, nen no cung khoa luon hanh vi sai cua truong hop CO sua (xem R5).
       */
      it('R4 — mo lai roi dong lai KHONG doi so lieu: phat lai dung ban cu', async () => {
        await reconciliation.reopenReconciliation(
          reconciliationId,
          'Cay xang gui lai bang ke bo sung',
          'it-t4rr-giam-doc',
        );
        await reconciliation.runMatching(reconciliationId, 'it-t4rr-ke-toan');
        await resolveAllPending('IGNORE_WITH_REASON');

        const closed = await reconciliation.closeReconciliation(
          reconciliationId,
          'it-t4rr-ke-toan',
        );

        expect(closed.handoff.id).toBe(firstHandoffId);
        expect(closed.handoff.revision).toBe(1);
        expect(
          await prisma.transportFuelSettlementHandoff.count({ where: { reconciliationId } }),
        ).toBe(1);
      });

      /**
       * R5 — MO LAI, SUA SO LIEU, DONG LAI: mot ban sua doi MOI, tro nguoc ve ban truoc.
       *
       * DAY LA LOI P0 §2 CUA BAN RA SOAT. Truoc T4R, lan dong nay tra ve dung ban giao 4.200.000d
       * cu — T5 khong bao gio hoc duoc rang ke toan da chap nhan them 3.000.000d cua cay xang, va
       * cay xang duoc tra thieu dung so do.
       */
      it('R5 — so lieu DOI: them mot ban sua doi moi, tro nguoc ve ban truoc', async () => {
        await reconciliation.reopenReconciliation(
          reconciliationId,
          'Ke toan chap nhan so cua cay xang cho dong le',
          'it-t4rr-giam-doc',
        );
        await reconciliation.runMatching(reconciliationId, 'it-t4rr-ke-toan');
        await resolveAllPending('ACCEPT_SUPPLIER_AMOUNT');

        const closed = await reconciliation.closeReconciliation(
          reconciliationId,
          'it-t4rr-ke-toan',
        );

        expect(closed.handoff.id).not.toBe(firstHandoffId);
        expect(closed.handoff.revision).toBe(2);
        expect(closed.handoff.supersedesId).toBe(firstHandoffId);
        expect(closed.handoff.acceptedAmount).toBe(7_200_000);
        expect(closed.handoff.acceptedLineCount).toBe(2);

        // CA CHUOI doc duoc, theo thu tu, va ban dau tien KHONG bi sua.
        const revisions = await fuelRepo.listHandoffRevisions(reconciliationId);
        expect(revisions.map((item) => item.revision)).toEqual([1, 2]);
        expect(revisions[0]!.acceptedAmount).toBe(4_200_000);
        expect(revisions[0]!.id).toBe(firstHandoffId);

        // `findHandoff` tra ve ban GAN NHAT — do la cai T5 phai doc.
        expect((await fuelRepo.findHandoff(reconciliationId))?.revision).toBe(2);
      });

      /**
       * R6 — GUI LAI DUNG BAN VUA PHAT: khong sinh ban thu ba.
       *
       * Nua con lai cua R5. Mot lan mo lai/dong lai vi mang chap chon phai la mot lan phat lai, chu
       * khong duoc lam chuoi ban sua doi dai them sau moi lan bam.
       */
      it('R6 — dong lai lan nua ma khong sua gi: van dung hai ban', async () => {
        await reconciliation.reopenReconciliation(
          reconciliationId,
          'Bam lai vi mang chap chon',
          'it-t4rr-giam-doc',
        );
        await reconciliation.runMatching(reconciliationId, 'it-t4rr-ke-toan');
        await resolveAllPending('ACCEPT_SUPPLIER_AMOUNT');

        const closed = await reconciliation.closeReconciliation(
          reconciliationId,
          'it-t4rr-ke-toan',
        );

        expect(closed.handoff.revision).toBe(2);
        expect(
          await prisma.transportFuelSettlementHandoff.count({ where: { reconciliationId } }),
        ).toBe(2);
      });

      /**
       * R7 — MIGRATION AN TOAN: phep dien du lieu cua migration cho ra DUNG cai ma ma nguon tinh.
       *
       * Bai nay chay CHINH cau `UPDATE` nam trong tep migration — doc tu dia, khong go lai — tren
       * cac hang da bi dua ve hinh dang CU (`acceptedLineIds` rong, dung nhu mot hang co truoc khi
       * nang cap). Neu ai do sua cau SQL do ma no khong con khop voi `sumAcceptedSettlement()`, bai
       * nay do.
       *
       * Do la dieu quan trong ma mot lan "migrate deploy chay khong loi" khong noi duoc: DDL ap
       * duoc khong co nghia la du lieu dien vao la DUNG.
       */
      it('R7 — cau dien du lieu cua migration dung lai DUNG bo dong da chap nhan', async () => {
        const before = await prisma.transportFuelSettlementHandoff.findMany({
          where: { reconciliationId },
          orderBy: { revision: 'asc' },
        });
        expect(before).toHaveLength(2);

        // Dua ca hai hang ve hinh dang TRUOC migration: chua ai biet den `acceptedLineIds`.
        await prisma.transportFuelSettlementHandoff.updateMany({
          where: { reconciliationId },
          data: { acceptedLineIds: [] },
        });

        const migrationSql = readFileSync(
          fileURLToPath(
            new URL(
              '../../../prisma/migrations/20260831180000_transport_fuel_handoff_revisions/migration.sql',
              import.meta.url,
            ),
          ),
          'utf8',
        );
        const backfill = migrationSql.slice(
          migrationSql.indexOf('UPDATE "TransportFuelSettlementHandoff" AS h'),
        );
        expect(backfill).toContain('ACCEPT_SUPPLIER_AMOUNT');

        await prisma.$executeRawUnsafe(backfill);

        const after = await prisma.transportFuelSettlementHandoff.findMany({
          where: { reconciliationId },
          orderBy: { revision: 'asc' },
        });
        // Ky nay hien dang chap nhan CA HAI dong, nen phep dien lai phai cho ra ca hai — cho ca hai
        // ban. Phep dien khong biet lich su, va no khong duoc phep doan.
        const lineIds = (
          await prisma.transportFuelStatementLine.findMany({
            where: { statementId },
            select: { id: true },
          })
        )
          .map((row) => row.id)
          .sort();
        for (const row of after) {
          expect([...row.acceptedLineIds].sort()).toEqual(lineIds);
        }

        // Va khong cot nao khac bi cham vao.
        expect(after.map((row) => Number(row.acceptedAmount))).toEqual(
          before.map((row) => Number(row.acceptedAmount)),
        );
        expect(after.map((row) => row.supersedesId)).toEqual(before.map((row) => row.supersedesId));
      });
    });
  },
);
