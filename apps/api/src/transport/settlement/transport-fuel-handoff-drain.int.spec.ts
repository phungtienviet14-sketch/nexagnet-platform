import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from '../fuel/fuel-policy.js';
import { FuelReconciliationService } from '../fuel/fuel-reconciliation.service.js';
import { FileFuelStatementSource } from '../fuel/fuel-statement-source.js';
import { FuelStatementService } from '../fuel/fuel-statement.service.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from '../fuel/fuel.ports.js';
import { FuelService } from '../fuel/fuel.service.js';
import { deleteFuelDiscrepanciesForTest } from '../fuel/fuel-test-cleanup.js';
import { MovementFuelRunContextAdapter } from '../fuel/fuel-run-context.port.js';
import { PrismaFuelRepository } from '../fuel/prisma-fuel.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PrismaFuelStationRepository } from '../fuel/prisma-fuel-station.repository.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { FuelHandoffDrainService } from './fuel-handoff-drain.service.js';
import {
  FUEL_HANDOFF_SCAN_ROW,
  PrismaSettlementRepository,
} from './prisma-settlement.repository.js';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import { SettlementOrderCompletionGate } from './settlement-order-completion.port.js';
import {
  FuelSettlementSource,
  FuelSettlementSourceAdapter,
  SettlementCoreFactsAdapter,
  type FuelHandoffFacts,
  type FuelHandoffScanPosition,
} from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';

/**
 * `#295` Lane V P0 — DUONG TU MOT KY DOI SOAT DA DONG TOI CONG NO CAY XANG, TREN POSTGRES THAT.
 *
 * ============================================================================================
 * VI SAO KHONG THE CHUNG MINH BANG KHO IN-MEMORY
 *
 * Bon dieu bo bai nay hua deu song o ranh gioi voi CSDL, khong o tang ung dung:
 *
 *   · `@@unique([sourceContext, sourceId])` — thu that su chan mot ban giao sinh hai cong no;
 *   · lenh ghi CO DIEU KIEN cua con tro (`consumedRevision < revision`) — thu chan hai vong quet
 *     song song keo con tro lui;
 *   · `P2002` tren khoa chinh con tro — duong ma hai vong quet cung TAO mot hang di vao;
 *   · tinh ben qua mot lan khoi dong lai — doc lai bang mot BO DOI TUONG MOI hoan toan.
 *
 * Mot kho in-memory se XANH ca bon du khong cai nao ton tai.
 *
 * ============================================================================================
 * KHONG GIEO THANG VAO BANG BAN GIAO
 *
 * `transport-settlement.int.spec.ts` (P4/P5) co y gieo thang hang ban giao, vi cai no chung minh la
 * T5 DOC chuoi do dung. Bo bai nay chung minh mot thu khac han: rang mot ke toan BAM NUT DONG KY
 * tren du lieu that lam cong no xuat hien ma khong ai goi gi them. Nen o day ky doi soat duoc dung
 * qua dung duong that — nop phieu, duyet, nhap bang ke, so khop, quyet chenh lech, dong ky — va
 * vong quet la thu duy nhat chay sau do.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Ban giao cay xang -> cong no nha cung cap, tren Postgres THAT — #295 Lane V P0',
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
    const fuelRuns = new MovementFuelRunContextAdapter(new PrismaMovementRepository(prisma));
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      fuelRuns,
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

    /**
     * CONG KET THUC DON KHONG NAM TREN DUONG NAY, va ban gia duoi day NOI RA dieu do.
     *
     * `ingestFuelHandoff()` khong hoi cong nghiem thu mot lan nao — cong do gac dong doanh thu
     * khach (`#275` K5), khong gac dong cay xang. Ban gia nay NEM neu bi hoi, nen neu mot ngay nao
     * do ai do noi hai duong lai voi nhau, bo bai se do ngay thay vi im lang di qua mot cong da bi
     * vo hieu hoa.
     */
    class UnusedCompletionGate extends SettlementOrderCompletionGate {
      eligibilityForTrip(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }

      eligibilityForOrder(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }
    }

    /** MOT ban `SettlementService` doc lap — bon ban sao la bon "tien trinh API" cua `V-P0-5`. */
    const buildIngest = (
      fuelSource: FuelSettlementSource = new FuelSettlementSourceAdapter(fuelRepo),
    ): SettlementService =>
      new SettlementService(
        settlementRepo,
        new SettlementCoreFactsAdapter(trips),
        fuelSource,
        new UnusedCompletionGate(),
      );

    const SUPPLIER_CODE = 'IT-LV-CX';
    const CODE_PREFIX = 'IT-LV-CH';
    const PHONE_PREFIX = '0977LV';
    const PLATE_PREFIX = 'IT-LV-XE';
    const ACTOR = 'it-lv-ke-toan';
    const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

    const state = {
      supplierId: '',
      driverId: '',
      vehicleId: '',
      tripId: '',
      reconciliationId: '',
    };

    /**
     * HOP THU NHIN QUA KINH CUA RIENG BO BAI NAY.
     *
     * ===========================================================================
     * Doan nay duoc them sau khi job `integration` o `ed517df` DO o mot tep KHAC:
     * `transport-settlement.int.spec.ts` `P4`, `expected +0 to be 2`. Tep do khong goi vong quet.
     *
     * Vong quet cua san pham doc TOAN BO hop thu — `listLatestHandoffs` chi loc `supersededBy: null`
     * va keyset, va do la dung: no phai thay moi ky da dong. Nhung job `integration` dung MOT
     * PostgreSQL cho moi tep, nen moi lan bo bai nay quet, no ghi cong no cho ca ban giao ma tep
     * KHAC vua gieo. `P4` gieo chuoi ban giao cua no trong `beforeAll` roi moi tu goi
     * `ingestFuelHandoff()`; bo bai nay quet trung vao khoang giua thi chung tu da co san, va
     * `created` ra `0`.
     *
     * Do bang log, khong suy doan: o run XANH `929eb5b` hai tep chay tach nhau — tep kia xong truoc
     * khi tep nay bat dau. O run DO `ed517df` chung chay chong nhau tron ven. Loi nam san tu khi tep
     * nay ra doi; lich chay chi quyet dinh LUC no lo ra, va lich chay khong phai thu mot bo bai
     * duoc phep dua vao.
     *
     * ===========================================================================
     * KINH NAY KHONG LAM YEU DIEU GI BO BAI CHUNG MINH:
     *
     *   · truy van keyset THAT van chay nguyen ven ben duoi — kinh chi loc trang no tra ve;
     *   · `V-P0-12` goi thang `listLatestHandoffs`, khong qua kinh, nen menh de SQL van duoc kiem
     *     tren TOAN bang;
     *   · dich vu, kho, con tro tieu thu, hang vi tri quet va `@@unique` deu la ban THAT;
     *   · hop thu dung chung o CI khong gan toi 500 hang, nen trang NGAN ca truoc lan sau khi loc, va
     *     quyet dinh quay-ve-dau/tien khong doi. Canh trang DAY va hang hong xen giua do `V-LIVE-1/2`
     *     o bo don vi kiem, o dung con so san xuat.
     *
     * Dung go kinh nay de "giong san pham hon": bo bai se lai cuop fixture cua tep ben canh, va lan
     * sau cai do cung lai la mot tep KHAC.
     */
    class OwnSupplierOutbox extends FuelSettlementSource {
      private readonly real = new FuelSettlementSourceAdapter(fuelRepo);

      latestHandoff(reconciliationId: string): Promise<FuelHandoffFacts | null> {
        return this.real.latestHandoff(reconciliationId);
      }

      handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]> {
        return this.real.handoffRevisions(reconciliationId);
      }

      async pendingHandoffs(input: {
        readonly after: FuelHandoffScanPosition | null;
        readonly limit: number;
      }): Promise<FuelHandoffFacts[]> {
        const page = await this.real.pendingHandoffs(input);
        return page.filter((handoff) => handoff.supplierId === state.supplierId);
      }
    }

    const buildDrain = (
      fuelSource: FuelSettlementSource = new OwnSupplierOutbox(),
    ): FuelHandoffDrainService =>
      new FuelHandoffDrainService(buildIngest(fuelSource), settlementRepo, fuelSource);

    /** Thu tu xoa theo dung chieu khoa ngoai — xem khoi cleanup cua `transport-fuel.int.spec.ts`. */
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
      /*
       * VI TRI QUET la mot hang DON toan cuc, khong gan voi cay xang nao — nen no khong loc duoc
       * theo `supplierIds` nhu moi thu khac o ham nay. Xoa duoc vi `FuelHandoffDrainService` chi co
       * DUNG MOT nguoi goi trong ca bo int: chinh tep nay. Neu mot ngay nao do co tep thu hai chay
       * vong quet, dong nay phai bo di — no se lam hai tep giat vi tri cua nhau.
       */
      await prisma.transportSettlementFuelHandoffScan.deleteMany({
        where: { id: FUEL_HANDOFF_SCAN_ROW },
      });
      await prisma.transportFuelSettlementHandoff.deleteMany({
        where: { reconciliationId: { in: reconIds } },
      });
      await prisma.transportFuelMatch.deleteMany({ where: { reconciliationId: { in: reconIds } } });
      // `#317` G0: quyet dinh da ghi co trigger chi-ghi-them — xoa qua helper tat trigger.
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

      /* Ban sua doi tro toi ban goc (`adjustsId`, onDelete: Restrict) — xoa tu ban sua ve ban goc. */
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
        orderBy: { createdAt: 'asc' },
      });

    /**
     * Quyet MOI cau hoi con treo bang mot cach da chon — khuon cua `transport-fuel-recovery.int.spec`.
     *
     * Chi dong `PENDING` moi duoc dong vao: mot dong da quyet ma quyet lai se bi may trang thai cua
     * `TX-04` tu choi, va bai test se do vi mot ly do khong lien quan gi den cai no dang do.
     */
    async function resolveAllPending(
      resolution: 'IGNORE_WITH_REASON' | 'ACCEPT_SUPPLIER_AMOUNT',
    ): Promise<void> {
      for (const item of await fuelRepo.listDiscrepancies(state.reconciliationId)) {
        if (item.status !== 'PENDING') continue;
        await reconciliation.resolveDiscrepancy(
          item.id,
          { resolution, note: `Quyet trong bai Lane V (${resolution})` },
          ACTOR,
        );
      }
    }

    /**
     * QUET CHO TOI KHI KY CUA BO BAI NAY DUOC DOC — khong phai "quet mot lan roi khang dinh".
     *
     * ===========================================================================
     * VONG QUET LA TOAN CUC, VA JOB `integration` DUNG CHUNG MOT POSTGRES.
     *
     * `pendingHandoffs()` doc ban giao moi nhat cua MOI ky trong CSDL — do la ca thiet ke cua no.
     * O job `integration`, 428 tep spec khac chay tren cung mot CSDL va nhieu tep trong so do de
     * lai ky doi soat DA DONG cua rieng chung. Nen:
     *
     *   · `summary.ingested` la mot con so TOAN CUC, khong phai con so cua bo bai nay. Khang dinh
     *     `ingested === 1` la khang dinh ve du lieu cua nguoi khac, va no do dung nhu the o lan
     *     chay dau tien tren CI;
     *   · chan lo (`FUEL_HANDOFF_DRAIN_BATCH`) co the het truoc khi toi luot ky nay, vi thu tu la
     *     `emittedAt` tang dan va ky cua bo bai nay vua dong nen nam CUOI hang.
     *
     * Nen moi khang dinh cua bo bai deu PHAI pham vi hoa theo `state.supplierId` /
     * `state.reconciliationId`, va viec quet phai lap cho toi khi con tro cua CHINH ky nay toi noi.
     *
     * ===========================================================================
     * SO LAN LAP: mot nhip di duoc nhieu nhat `FUEL_HANDOFF_DRAIN_BATCH` (25) ky con viec, va vi
     * tri quet giu cho nhip sau di TIEP chu khong doc lai tu dau. 40 nhip la 1000 ky cua nguoi khac
     * — rong rai hon nhieu lan so ky ma ca bo int co the de lai.
     */
    async function drainUntilConsumed(revision: number): Promise<void> {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const cursors = await settlementRepo.fuelHandoffCursors([state.reconciliationId]);
        if ((cursors.get(state.reconciliationId) ?? 0) >= revision) return;
        await buildDrain().drain();
      }
      throw new Error(`Vong quet khong doc toi ban ${revision} cua ky ${state.reconciliationId}`);
    }

    /** Khoa doc cua mot ban giao, dung dang ma vi tri quet luu. */
    const keyOf = (handoff: { readonly emittedAt: string; readonly id: string }) => ({
      emittedAt: handoff.emittedAt,
      handoffId: handoff.id,
    });

    const scanRow = () =>
      prisma.transportSettlementFuelHandoffScan.findUnique({
        where: { id: FUEL_HANDOFF_SCAN_ROW },
      });

    const driverFundEntryCount = () =>
      prisma.transportDriverFundEntry.count({
        where: { account: { driver: { phone: { startsWith: PHONE_PREFIX } } } },
      });

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang kiem thu Lane V',
          code: SUPPLIER_CODE,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-09-01T00:00:00Z'),
        })
      ).id;

      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT LV Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: 'IT-LV-user',
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
        assignedBy: 'it-lv',
        at: new Date('2026-09-05T00:00:00Z'),
      });

      /* MOT phieu khop tuyet doi, va MOT dong bang ke khong co phieu -> mot chenh lech phai quyet. */
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
          correlationKey: 'it-lv-phieu-khop',
        },
        ACTOR,
      );
      await fuel.verifyFuelEntry(entry.id, ACTOR);

      const plate = `${PLATE_PREFIX}-A`;
      const csv = [
        'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
        `${plate},2026-09-05,200,4.200.000,HD-LV-KHOP,`,
        `${plate},2026-09-20,90,2.000.000,HD-LV-LE,khong co phieu tuong ung`,
      ].join('\n');

      const imported = await statements.commitImport(
        {
          supplierId: state.supplierId,
          periodStart: PERIOD.start,
          periodEnd: PERIOD.end,
          filename: 'it-lv-bang-ke.csv',
          format: 'CSV',
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        },
        ACTOR,
      );
      state.reconciliationId = imported.reconciliation.id;

      await reconciliation.runMatching(state.reconciliationId, ACTOR);
    });

    /* ================================================================ *
     * V-P0-1, V-P0-2 — TRUOC khi dong ky: khong mot dong cong no nao
     * ================================================================ */

    it('V-P0-1 — to khai lai xe + chenh lech chua quyet: quet KHONG sinh cong no nao', async () => {
      /*
       * Trang thai luc nay: mot phieu DA DUYET, mot dong bang ke le, mot chenh lech PENDING. Day la
       * hai bai acceptance 9 va 8 cua `#295` gop lam mot: *"driver-only declaration -> no supplier
       * payable"* va *"unresolved/mismatch chua human-resolve -> zero AP"*.
       */
      await buildDrain().drain();

      /*
       * Pham vi hoa theo `supplierId`: vong quet co the vua doc ky cua mot tep spec KHAC tren cung
       * CSDL, va do khong phai viec cua bai nay. Cai bai nay do la: ky CUA NO khong sinh gi.
       */
      expect(await supplierDocuments()).toHaveLength(0);
      expect(
        await prisma.transportSettlementFuelHandoffCursor.count({
          where: { reconciliationId: state.reconciliationId },
        }),
      ).toBe(0);
    });

    it('V-P0-2 — con chenh lech PENDING thi KHONG dong duoc ky (cong cua T4 van dong)', async () => {
      await expect(
        reconciliation.closeReconciliation(state.reconciliationId, ACTOR),
      ).rejects.toMatchObject({ reason: 'RECONCILIATION_HAS_PENDING_DISCREPANCY' });
    });

    /* ================================================================ *
     * V-P0-3..6 — dong ky roi: cong no xuat hien DUNG MOT LAN
     * ================================================================ */

    it('V-P0-3 — quyet chenh lech + dong ky -> mot luot quet sinh DUNG MOT cong no goc', async () => {
      /*
       * `IGNORE_WITH_REASON` cho dong le o lan dong DAU — de lan dong THU HAI (`V-P0-7`) con cho
       * chap nhan no va lam ket qua kinh te DOI. Chieu nguoc lai (tong GIAM) do `#317` dong va duoc
       * do o `transport-fuel-decision-revision.int.spec.ts`.
       */
      await resolveAllPending('IGNORE_WITH_REASON');

      const closed = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      expect(closed.handoff.revision).toBe(1);

      await drainUntilConsumed(1);

      const documents = await supplierDocuments();
      expect(documents).toHaveLength(1);
      expect(documents[0]!.kind).toBe('ORIGINAL');
      expect(documents[0]!.flow).toBe('FUEL_SUPPLIER');
      expect(documents[0]!.sourceContext).toBe('FUEL_SETTLEMENT_HANDOFF');
      expect(documents[0]!.sourceId).toBe(closed.handoff.id);
      /* CHI dong da khop (4.200.000) — dong le bi bo qua co ly do. Ghi AM vi la chieu PHAI TRA. */
      expect(Number(documents[0]!.signedAmount)).toBe(-4_200_000);

      const cursor = await prisma.transportSettlementFuelHandoffCursor.findUnique({
        where: { reconciliationId: state.reconciliationId },
      });
      expect(cursor?.consumedRevision).toBe(1);
      expect(cursor?.consumedHandoffId).toBe(closed.handoff.id);
    });

    it('V-P0-4 — quet lai ba lan nua: van DUNG MOT cong no', async () => {
      const drain = buildDrain();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await drain.drain();
      }

      /* Con so phai dung la con so CUA KY NAY, khong phai `summary.ingested` toan cuc. */
      expect(await supplierDocuments()).toHaveLength(1);
      const cursors = await settlementRepo.fuelHandoffCursors([state.reconciliationId]);
      expect(cursors.get(state.reconciliationId)).toBe(1);
    });

    it('V-P0-5 — BON vong quet chay song song: van DUNG MOT cong no', async () => {
      /*
       * Bon ban sao doc lap, dung khuon "bon tien trinh API cung chay". Con tro bi xoa truoc de ca
       * bon deu THAY viec. Neu phep chong ghi trung chi song o tang ung dung, bai nay se thay nhieu
       * hon mot hang: giua lan doc va lan ghi cua moi ban sao co du cho cho ba ban con lai chen vao.
       */
      await prisma.transportSettlementFuelHandoffCursor.deleteMany({
        where: { reconciliationId: state.reconciliationId },
      });

      /*
       * Doc TRUC TIEP qua `ingestFuelHandoff`, khong qua `drain()`.
       *
       * Qua `drain()` thi khong bao dam ca bon ban sao thuc su cham toi ky nay: chan lo la 25 va
       * CSDL cua job `integration` dung chung voi 428 tep spec khac, nen mot lo co the het truoc khi
       * toi luot. Bai se van XANH — va xanh vi khong ai lam gi, tuc no khong con do dieu no hua.
       *
       * Goi thang thi bon lan ghi CHAC CHAN cung nham vao mot ban giao, va do dung la tinh huong
       * can do.
       */
      await Promise.all([
        buildIngest().ingestFuelHandoff(state.reconciliationId, 'it-lv-song-song-1'),
        buildIngest().ingestFuelHandoff(state.reconciliationId, 'it-lv-song-song-2'),
        buildIngest().ingestFuelHandoff(state.reconciliationId, 'it-lv-song-song-3'),
        buildIngest().ingestFuelHandoff(state.reconciliationId, 'it-lv-song-song-4'),
      ]);

      expect(await supplierDocuments()).toHaveLength(1);

      /* Tra lai con tro cho nhung bai sau — chinh vong quet lam viec do, khong phai mot lenh SQL. */
      await drainUntilConsumed(1);
    });

    it('V-P0-6 — mot BO DOI TUONG MOI (khoi dong lai) doc lai dung trang thai da chot', async () => {
      const freshPrisma = new PrismaService();
      const freshRepo = new PrismaSettlementRepository(freshPrisma);
      const freshCursors = await freshRepo.fuelHandoffCursors([state.reconciliationId]);
      expect(freshCursors.get(state.reconciliationId)).toBe(1);

      await buildDrain().drain();
      expect(await supplierDocuments()).toHaveLength(1);
    });

    /* ================================================================ *
     * V-P0-7, V-P0-8 — mo lai, sua so lieu, dong lai -> BAN DIEU CHINH
     * ================================================================ */

    it('V-P0-7 — mo lai + sua quyet dinh + dong lai -> mot ban DIEU CHINH dung chenh lech', async () => {
      await reconciliation.reopenReconciliation(
        state.reconciliationId,
        'cay xang gui lai so lieu',
        ACTOR,
      );

      /*
       * CHAY LAI SO KHOP la bat buoc sau khi mo lai — khuon cua `R4`/`R5` trong
       * `transport-fuel-recovery.int.spec.ts`, va la thu sinh lai chenh lech o trang thai `PENDING`.
       *
       * ===========================================================================
       * CHIEU SUA O DAY LA `IGNORE -> ACCEPT` (tong TANG).
       *
       * Khi bai nay duoc viet, chieu nguoc lai (`ACCEPT -> IGNORE`) KHONG lam tong giam — do la phat
       * hien G0 cua `#295`. `#317` da dong G0: quyet dinh moi cua mot dong NOI CHUOI vao quyet dinh cu
       * (`supersedesId`) va phep cong chi doc quyet dinh HIEU LUC. Chieu GIAM, ban DIEU CHINH duong,
       * doi chung am va ghi dong thoi nam o `transport-fuel-decision-revision.int.spec.ts`.
       *
       * Bo bai nay giu chieu TANG: chap nhan them mot dong -> tong tang tu 4.200.000 len 6.200.000 ->
       * ban sua doi so 2, va mot chung tu DIEU CHINH mang dung chenh lech.
       */
      await reconciliation.runMatching(state.reconciliationId, ACTOR);
      await resolveAllPending('ACCEPT_SUPPLIER_AMOUNT');

      const closedAgain = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      expect(closedAgain.handoff.revision).toBe(2);
      expect(closedAgain.handoff.acceptedAmount).toBe(6_200_000);

      await drainUntilConsumed(2);

      const documents = await supplierDocuments();
      expect(documents).toHaveLength(2);

      const original = documents.find((row) => row.kind === 'ORIGINAL');
      const adjustment = documents.find((row) => row.kind === 'ADJUSTMENT');
      expect(Number(original!.signedAmount)).toBe(-4_200_000);
      /* -6.200.000 - (-4.200.000) = -2.000.000: no TANG THEM, khong phai mot cong no thu hai. */
      expect(Number(adjustment!.signedAmount)).toBe(-2_000_000);
      expect(adjustment!.adjustsId).toBe(original!.id);
      expect(adjustment!.sourceId).toBe(closedAgain.handoff.id);

      const cursor = await prisma.transportSettlementFuelHandoffCursor.findUnique({
        where: { reconciliationId: state.reconciliationId },
      });
      expect(cursor?.consumedRevision).toBe(2);
    });

    it('V-P0-8 — quet lai sau ban sua doi: khong sinh them hang nao', async () => {
      await buildDrain().drain();
      await buildDrain().drain();
      expect(await supplierDocuments()).toHaveLength(2);
    });

    /* ================================================================ *
     * V-P0-12..16 — TIEN DO cua vong quet, tren Postgres THAT
     *
     * Nam bai nay duoc them sau `INDEPENDENT_CHATGPT_REVIEW` (15/09/2026), va chung kiem mot tinh
     * chat KHAC han muoi mot bai tren: khong phai "so tien co dung khong" ma "moi ban giao co bao
     * gio toi luot khong".
     *
     * `fuel-handoff-drain.service.spec.ts` dung lai canh 501 ky va canh 25 ky hong o dung con so
     * san xuat, nhanh gap tram lan. Cai no KHONG kiem duoc, va nam bai duoi day kiem, la phan nam
     * duoi tang ung dung:
     *
     *   · menh de keyset that su dich ra SQL dung — mot ban gia trong bo don vi chi BAT CHUOC no;
     *   · hang vi tri quet ben qua mot doi tuong kho moi, va lenh ghi co dieu kien that su tu choi
     *     mot buoc lui;
     *   · rang buoc `CHECK` tu choi nua keyset;
     *   · va sau cung: mot ban giao nam SAU vi tri quet VAN toi luot — dung hinh dang cua ky thu
     *     501, chi khac la dung mot cho do thay vi 501 ky that.
     *
     * So thu tu nhay coc (12..16 dung TRUOC 9..11) la CO Y: `V-P0-11` dem hang quy lai xe sau khi
     * ca tep da chay, nen no phai o cuoi cung de phu luon nhung luot quet moi them o day. Doi cho
     * de so lien mach se lam bat bien 1/3 cua `#295` khong con che duoc nam bai nay.
     * ================================================================ */

    it('V-P0-12 — truy van keyset KHONG tra lai hang da di qua', async () => {
      const first = await fuelRepo.listLatestHandoffs({ after: null, limit: 1 });
      expect(first).toHaveLength(1);
      const moc = first[0]!;

      const next = await fuelRepo.listLatestHandoffs({ after: keyOf(moc), limit: 50 });

      expect(next.map((row) => row.id)).not.toContain(moc.id);
      /* Va moi hang tra ve deu dung SAU moc theo dung thu tu doc `(emittedAt, id)`. */
      for (const row of next) {
        const sau =
          row.emittedAt > moc.emittedAt || (row.emittedAt === moc.emittedAt && row.id > moc.id);
        expect(sau).toBe(true);
      }
    });

    it('V-P0-13 — vi tri quet ben qua mot doi tuong kho MOI, va tu choi buoc lui', async () => {
      const handoff = await fuelRepo.findHandoff(state.reconciliationId);
      const day = keyOf(handoff!);

      /*
       * QUAY VE DAU TRUOC DA, va day khong phai mot dong don dep cho gon.
       *
       * Muoi mot bai tren da quet nhieu luot, va CSDL nay dung chung voi 428 tep spec khac — vi tri
       * quet luc nay co the DA o sau ban giao cua bo bai. Ma lenh ghi chi-tien se TU CHOI mot buoc
       * lui, nen khong quay ve dau truoc thi bai duoi do vi chinh cai tinh chat no dang kiem.
       */
      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), day);

      /*
       * Mot "tien trinh API" khac: doi tuong kho MOI hoan toan, cung PostgreSQL. Day la noi dung
       * that su cua `restart-safe` — khong phai timer nho duoc, ma khong CAN nho.
       */
      const sauKhoiDongLai = await new PrismaSettlementRepository(prisma).fuelHandoffScan();
      expect(sauKhoiDongLai.position).toEqual(day);

      /*
       * Mot vong quet cham nhip hon co gang keo vi tri VE cho cu cua no. Lenh ghi co dieu kien o
       * `WHERE` tu choi — neu khong, hai tien trinh se giat nhau va vong quet co the khong bao gio
       * toi duoi hop thu, tuc khong bao gio quay ve dau, tuc viec cua nhung ky ghi hong khong bao
       * gio duoc lam lai.
       */
      const buocLui = await settlementRepo.advanceFuelHandoffScan(
        await settlementRepo.fuelHandoffScan(),
        { emittedAt: '2020-01-01T00:00:00.000Z', handoffId: 'it-lv-cu-hon' },
      );
      expect(buocLui.advanced).toBe(false);
      expect((await settlementRepo.fuelHandoffScan()).position).toEqual(day);
    });

    it('V-P0-14 — het hop thu: quay ve dau va dem them mot vong', async () => {
      /* Do vi tri quet o mot thoi diem sau MOI ban giao co the co trong CSDL dung chung. */
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), {
        emittedAt: '2099-01-01T00:00:00.000Z',
        handoffId: 'it-lv-cuoi-hop-thu',
      });
      const truoc = (await scanRow())?.cycles ?? 0;

      const summary = await buildDrain().drain();

      expect(summary.wrapped).toBe(true);
      const sau = await scanRow();
      expect(sau?.lastEmittedAt).toBeNull();
      expect(sau?.lastHandoffId).toBeNull();
      expect(sau?.cycles).toBe(truoc + 1);
    });

    it('V-P0-15 — CSDL tu choi mot NUA keyset', async () => {
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), {
        emittedAt: '2026-09-20T00:00:00.000Z',
        handoffId: 'it-lv-nua-keyset',
      });

      /*
       * Mot nua keyset la mot vi tri KHONG SO SANH DUOC, va mot vi tri nhu vay lam vong quet hoac
       * nhay qua mot hang hoac doc lai mot hang mai mai. Rang buoc nay o tang CSDL chu khong o tang
       * ung dung vi mot ban va sau nay ghi nua keyset se hong IM LANG.
       */
      await expect(
        prisma.$executeRawUnsafe(
          'UPDATE "TransportSettlementFuelHandoffScan" SET "lastHandoffId" = NULL WHERE "id" = $1',
          FUEL_HANDOFF_SCAN_ROW,
        ),
      ).rejects.toThrow();

      expect((await scanRow())?.lastHandoffId).toBe('it-lv-nua-keyset');
    });

    it('V-P0-16 — ban giao nam SAU vi tri quet VAN toi luot sau khi vong quan', async () => {
      /*
       * ===========================================================================
       * DAY LA KY THU 501, dung lai bang mot cho do thay vi 501 ky that.
       *
       * Xoa con tro tieu thu => ky nay "con viec". Do vi tri quet o phia SAU ban giao cua no => mot
       * vong quet chi-tien se KHONG BAO GIO nhin thay no nua. Dung canh ma ban truoc chet, va dung
       * ly do vi sao `rewindFuelHandoffScan` phai ton tai.
       */
      await prisma.transportSettlementFuelHandoffCursor.delete({
        where: { reconciliationId: state.reconciliationId },
      });
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), {
        emittedAt: '2099-01-01T00:00:00.000Z',
        handoffId: 'it-lv-qua-xa',
      });

      await drainUntilConsumed(2);

      const cursor = await prisma.transportSettlementFuelHandoffCursor.findUnique({
        where: { reconciliationId: state.reconciliationId },
      });
      expect(cursor?.consumedRevision).toBe(2);

      /*
       * Va KHONG mot chung tu nao sinh them. Lan doc lai nay la mot lan doc THU HAI tren cung mot
       * ban giao — dung luc `@@unique([sourceContext, sourceId])` phai lam viec cua no. Neu cho nay
       * ra 3, thi cai gia cua tinh song vua la mot khoan tra hai lan.
       */
      expect(await supplierDocuments()).toHaveLength(2);
    });

    /* ================================================================ *
     * V-P0-17, V-P0-18 — HAI TIEN TRINH cung quet mot hop thu
     *
     * Hai bai nay duoc them sau `INDEPENDENT_CHATGPT_REVIEW_2` (15/09/2026). Nam bai tren chung
     * minh vong quet CHAY khi chi co mot tien trinh; hai bai duoi chung minh no khong bi mot ban
     * sao CHAM keo lui.
     *
     * `V-P0-13` da chung minh `advanceFuelHandoffScan` tu choi mot buoc lui, va `V-P0-14/16` chung
     * minh mot lan quay ve dau BINH THUONG chay dung. Khong bai nao trong so do cham vao canh o
     * day: mot lan quay ve dau DEN MUON, sau khi mot tien trinh khac da tien toi vi tri moi.
     * ================================================================ */

    it('V-P0-17 — nhip CU khong keo lui duoc tien do ma nhip MOI vua tao ra', async () => {
      /*
       * Hai moc nam o nam 2099 de khong dung vao bat cu ban giao that nao cua tep nay: bai nay noi
       * ve TRANH CHAP tren mot hang don, khong ve noi dung hop thu.
       */
      const anhChupCu = {
        emittedAt: '2099-05-01T00:00:00.000Z',
        handoffId: 'it-lv-anh-chup-cu',
      };
      const tienDoMoi = {
        emittedAt: '2099-06-01T00:00:00.000Z',
        handoffId: 'it-lv-tien-do-moi',
      };

      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      await settlementRepo.advanceFuelHandoffScan(
        await settlementRepo.fuelHandoffScan(),
        anhChupCu,
      );

      /*
       * CHO KHUNG LAI cua tien trinh A, dat vao mot diem `await` THAT.
       *
       * `drain()` doc trang thai quet TRUOC khi doc hop thu. Nen viec chen o day xay ra dung khoang
       * giua "A da doc trang thai" va "A ket luan la het hop thu" — dung cua so ma `INDEPENDENT_
       * CHATGPT_REVIEW_2` mo ta, va no duoc dung bang chinh dich vu san xuat chu khong mo phong.
       */
      let cyclesSauB = -1;
      let daChen = false;
      const chenGiuaNhip = {
        pendingHandoffs: async (): Promise<FuelHandoffFacts[]> => {
          if (!daChen) {
            daChen = true;

            /* B cung cham day hop thu, va B doc dung trang thai hien tai nen B DUOC quay ve dau. */
            const cuaB = await settlementRepo.rewindFuelHandoffScan(
              await settlementRepo.fuelHandoffScan(),
            );
            expect(cuaB.rewound).toBe(true);

            /* C quet vong moi va tien toi mot vi tri moi. Day la TIEN DO THAT can duoc bao ve. */
            await settlementRepo.advanceFuelHandoffScan(
              await settlementRepo.fuelHandoffScan(),
              tienDoMoi,
            );
            cyclesSauB = (await settlementRepo.fuelHandoffScan()).cycles;
          }

          /* Voi A, hop thu trong — nen A ket luan "het hop thu" va di quay ve dau. */
          return [];
        },
      } as unknown as FuelSettlementSource;

      const summary = await buildDrain(chenGiuaNhip).drain();

      expect(daChen).toBe(true);

      /*
       * A KHONG duoc bao la vua quan mot vong. Truong nay khong phai my pham: lich quet va be mat
       * chan doan doc no de tra loi *"vong quet co chay khong"*, va mot lan quan GIA se lam mot he
       * thong dang giat nhau trong nhu mot he thong khoe manh.
       */
      expect(summary.wrapped).toBe(false);

      const sau = await settlementRepo.fuelHandoffScan();
      expect(sau.position).toEqual(tienDoMoi);
      expect(sau.cycles).toBe(cyclesSauB);
    });

    it('V-P0-18 — CUNG mot vi tri nhung khac VONG: lan quay ve dau cu van bi tu choi', async () => {
      /*
       * ===========================================================================
       * BAI NAY DO NEU PHEP SO SANH CHI NHIN `position`, va do la ly do duy nhat no ton tai.
       *
       * Vi tri quet khong nhan gia tri tuy y: hop thu chi co hang chuc ky, va moi vong lai di qua
       * dung nhung hang do. Nen `A -> B -> A` tren rieng vi tri khong phai mot canh ly thuyet —
       * no la hinh dang BINH THUONG cua bang nay sau vai vong.
       *
       * Mot anh chup cu roi trung vi tri voi trang thai hien tai thi KHONG duoc coi la con moi.
       */
      const moc = { emittedAt: '2099-07-01T00:00:00.000Z', handoffId: 'it-lv-aba' };

      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), moc);

      const cu = await settlementRepo.fuelHandoffScan();
      expect(cu.position).toEqual(moc);

      /* MOT VONG TRON cua mot tien trinh khac: quay ve dau, roi tien lai toi DUNG vi tri cu. */
      expect((await settlementRepo.rewindFuelHandoffScan(cu)).rewound).toBe(true);
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), moc);

      const bayGio = await settlementRepo.fuelHandoffScan();
      expect(bayGio.position).toEqual(cu.position);
      expect(bayGio.cycles).toBe(cu.cycles + 1);

      /* Anh chup `cu` gio da cu mot vong. Lan ghi cua no phai khong xay ra. */
      expect((await settlementRepo.rewindFuelHandoffScan(cu)).rewound).toBe(false);
      expect(await settlementRepo.fuelHandoffScan()).toEqual(bayGio);
    });

    /* ================================================================ *
     * V-P0-19..23 — lan TIEN den muon, va lan tien CUNG vong
     *
     * Nam bai nay duoc them sau `INDEPENDENT_CHATGPT_REVIEW_3` (16/09/2026). `V-P0-17/18` chung
     * minh lan QUAY VE DAU cu khong xoa duoc tien do moi. Lan TIEN cu thi chua bai nao kiem, va do
     * la lo con lai: ban truoc chi so VI TRI, nen mot nhip cua vong N ghi duoc vao vong N+1.
     *
     *   · `V-P0-19` — dung chuoi cua vong soat, tren kho that: CSDL phai o lai R trong vong N+1;
     *   · `V-P0-20` — vong moi di toi DUNG vi tri nhip cu da thay: so vi tri thi khong phan biet
     *     duoc, chi so hieu vong moi phan biet duoc;
     *   · `V-P0-21` — cung canh do qua DICH VU san xuat, de khoa viec dich vu dua vao anh chup LUC
     *     BAT DAU nhip chu khong phai mot anh chup doc lai;
     *   · `V-P0-22`, `V-P0-23` — dieu kien thu hai cua vong soat: lan tien CUNG vong chay song song
     *     van chi tien va dung o cho XA NHAT, ke ca khi hang vi tri quet chua ton tai.
     *
     * Moi moc vi tri o day la gia (nam 2000 hoac 2099) va khong trung ban giao nao: cac bai noi ve
     * TRANH CHAP tren hang don, khong ve noi dung hop thu — tru `V-P0-21`, co y dung ban giao that.
     * ================================================================ */

    it('V-P0-19 — lan tien CU cua vong N khong ghi duoc vao vong N+1: CSDL van o R', async () => {
      const P = { emittedAt: '2099-08-01T00:00:00.000Z', handoffId: 'it-lv-vong-n-p' };
      const R = { emittedAt: '2099-08-05T00:00:00.000Z', handoffId: 'it-lv-vong-moi-r' };
      const Q = { emittedAt: '2099-08-09T00:00:00.000Z', handoffId: 'it-lv-vong-cu-q' };

      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), P);

      /* A doc anh chup cua vong N, duyet trang toi Q, roi KHUNG lai truoc khi tien. */
      const cuaA = await settlementRepo.fuelHandoffScan();
      expect(cuaA.position).toEqual(P);

      /* B cham day hop thu -> vong N+1. */
      const cuaB = await settlementRepo.rewindFuelHandoffScan(
        await settlementRepo.fuelHandoffScan(),
      );
      expect(cuaB.rewound).toBe(true);

      /* C quet vong N+1 TU DAU va tien toi R — thap hon Q. */
      const cuaC = await settlementRepo.fuelHandoffScan();
      expect(cuaC).toEqual({ position: null, cycles: cuaA.cycles + 1 });
      expect((await settlementRepo.advanceFuelHandoffScan(cuaC, R)).advanced).toBe(true);

      /* A tinh day. Q nam SAU R, nen ban chi-so-vi-tri cho lan ghi nay di qua. */
      expect((await settlementRepo.advanceFuelHandoffScan(cuaA, Q)).advanced).toBe(false);

      expect(await settlementRepo.fuelHandoffScan()).toEqual({
        position: R,
        cycles: cuaA.cycles + 1,
      });
      /* Doc thang hang CSDL, khong qua kho: dung cot, dung gia tri. */
      expect(await scanRow()).toMatchObject({
        lastEmittedAt: new Date(R.emittedAt),
        lastHandoffId: R.handoffId,
        cycles: cuaA.cycles + 1,
      });

      /*
       * ===========================================================================
       * DOI CHUNG AM: menh de `WHERE` CU, chay tren CHINH trang thai nay.
       *
       * Vong soat yeu cau "mutation ban cu phai do". Bo don vi da chay DUNG ma cu cua dich vu va kho
       * in-memory (`V-LIVE-6` do tren ban cu). O day, tren Postgres that, lenh duoi la NGUYEN VAN
       * lenh ghi cua `advanceFuelHandoffScan` truoc `REVIEW_3` — chi so vi tri. No phai cham DUNG
       * mot hang, tuc lan tien cu cua A lot duoc vao vong N+1.
       *
       * Neu mot ngay lenh nay ra `0`, canh dung o tren da thoi tai hien duoc loi, va bai kiem se
       * xanh ma khong chung minh gi. Khang dinh chinh cua bai da nam o TREN; dong nay chi giu cho
       * canh dung con co nghia.
       */
      const atQ = new Date(Q.emittedAt);
      const menhDeCu = await prisma.transportSettlementFuelHandoffScan.updateMany({
        where: {
          id: FUEL_HANDOFF_SCAN_ROW,
          OR: [
            { lastEmittedAt: null },
            { lastEmittedAt: { lt: atQ } },
            { lastEmittedAt: atQ, lastHandoffId: { lt: Q.handoffId } },
          ],
        },
        data: { lastEmittedAt: atQ, lastHandoffId: Q.handoffId },
      });
      expect(menhDeCu.count).toBe(1);
      /* Dung hinh dang loi cua vong soat: vong N+1 bi day toi Q, bo qua (R, Q]. */
      expect(await settlementRepo.fuelHandoffScan()).toEqual({
        position: Q,
        cycles: cuaA.cycles + 1,
      });
    });

    it('V-P0-20 — vong N+1 di toi DUNG vi tri nhip cu da thay: lan tien cu VAN bi tu choi', async () => {
      /*
       * BAI NAY DO NEU LAN TIEN CHI SO VI TRI — ke ca mot phep so vi tri CHINH XAC kieu "ben van la
       * P thi moi tien". Vi tri quet chi nhan mot tap huu han gia tri va moi vong lai di qua dung
       * nhung hang do, nen canh vong moi dung dung cho vong cu tung dung la hinh dang binh thuong
       * cua bang nay — cung ly do voi `V-P0-18`, o lan ghi con lai.
       */
      const P = { emittedAt: '2099-08-11T00:00:00.000Z', handoffId: 'it-lv-aba-tien-p' };
      const Q = { emittedAt: '2099-08-19T00:00:00.000Z', handoffId: 'it-lv-aba-tien-q' };

      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), P);
      const cuaA = await settlementRepo.fuelHandoffScan();

      const cuaB = await settlementRepo.rewindFuelHandoffScan(
        await settlementRepo.fuelHandoffScan(),
      );
      expect(cuaB.rewound).toBe(true);
      const cuaC = await settlementRepo.advanceFuelHandoffScan(
        await settlementRepo.fuelHandoffScan(),
        P,
      );
      expect(cuaC.advanced).toBe(true);

      const vongMoi = await settlementRepo.fuelHandoffScan();
      expect(vongMoi).toEqual({ position: cuaA.position, cycles: cuaA.cycles + 1 });

      expect((await settlementRepo.advanceFuelHandoffScan(cuaA, Q)).advanced).toBe(false);
      expect(await settlementRepo.fuelHandoffScan()).toEqual(vongMoi);
    });

    it('V-P0-21 — qua DICH VU that: nhip cua vong N khung lai qua mot lan quay ve dau khong tien duoc', async () => {
      /*
       * ===========================================================================
       * `V-P0-19` chung minh menh de `WHERE`. Bai nay chung minh DICH VU dua dung anh chup vao do —
       * anh chup doc LUC BAT DAU nhip. Mot ban sua "doc lai trang thai ngay truoc khi tien" van xanh
       * `V-P0-19`, va do o day: anh chup doc lai luon mang so hieu vong moi nhat.
       *
       * Trang cua A la ban giao THAT cua bo bai, da tieu thu toi ban moi nhat (`V-P0-16`), nen A
       * khong ghi mot dong cong no nao: lan ghi duy nhat A con lam la lan tien dang duoc kiem. Trang
       * dai MOT hang voi `scanPage: 1` la trang DAY, nen A khong ket luan het hop thu ma di toi lan
       * tien.
       */
      const P = { emittedAt: '2000-01-01T00:00:00.000Z', handoffId: 'it-lv-dich-vu-p' };
      const R = { emittedAt: '2000-06-01T00:00:00.000Z', handoffId: 'it-lv-dich-vu-r' };

      const that = await new FuelSettlementSourceAdapter(fuelRepo).latestHandoff(
        state.reconciliationId,
      );
      expect(that).not.toBeNull();
      const tieuThu = await settlementRepo.fuelHandoffCursors([state.reconciliationId]);
      expect(tieuThu.get(state.reconciliationId)).toBe(that!.revision);

      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      await settlementRepo.advanceFuelHandoffScan(await settlementRepo.fuelHandoffScan(), P);
      const truoc = await settlementRepo.fuelHandoffScan();

      /* CHO KHUNG LAI cua A: `drain()` da doc `truoc`, chua tien. */
      let daChen = false;
      const chenGiuaNhip = {
        pendingHandoffs: async (): Promise<FuelHandoffFacts[]> => {
          if (!daChen) {
            daChen = true;

            const cuaB = await settlementRepo.rewindFuelHandoffScan(
              await settlementRepo.fuelHandoffScan(),
            );
            expect(cuaB.rewound).toBe(true);

            const cuaC = await settlementRepo.advanceFuelHandoffScan(
              await settlementRepo.fuelHandoffScan(),
              R,
            );
            expect(cuaC.advanced).toBe(true);
          }
          return [that!];
        },
      } as unknown as FuelSettlementSource;

      const summary = await buildDrain(chenGiuaNhip).drain({ scanPage: 1, drainBatch: 25 });

      expect(daChen).toBe(true);
      expect(summary).toEqual({
        ingested: 0,
        alreadyCurrent: 1,
        failed: 0,
        saturated: false,
        wrapped: false,
      });

      /* Ban giao that nam SAU R (nam 2000), nen ban truoc da ghi no vao vong N+1. */
      expect(await settlementRepo.fuelHandoffScan()).toEqual({
        position: R,
        cycles: truoc.cycles + 1,
      });
    });

    it('V-P0-22 — CUNG vong, chin lan tien SONG SONG: vi tri chi tien va dung o cho xa nhat', async () => {
      /*
       * ===========================================================================
       * DIEU KIEN THU HAI CUA VONG SOAT: dua so hieu vong vao phep so sanh KHONG duoc bien lan tien
       * thanh mot CAS tren vi tri.
       *
       * Chin lenh ghi cung mang MOT anh chup (dau vong N) va chay SONG SONG that tren pool ket noi
       * cua Prisma, tranh nhau mot hang. Postgres bat lenh sau doi lenh truoc roi DANH GIA LAI
       * `WHERE` tren ban hang moi nhat, nen cho dung phai la cho XA NHAT, bat ke thu tu toi.
       */
      await settlementRepo.rewindFuelHandoffScan(await settlementRepo.fuelHandoffScan());
      const dauVong = await settlementRepo.fuelHandoffScan();
      expect(dauVong.position).toBeNull();

      const moc = (ngay: number): FuelHandoffScanPosition => ({
        emittedAt: `2099-10-${String(ngay).padStart(2, '0')}T00:00:00.000Z`,
        handoffId: `it-lv-cung-vong-${ngay}`,
      });
      const dich = [13, 17, 11, 19, 15, 12, 18, 14, 16];

      const ketQua = await Promise.all(
        dich.map((ngay) => settlementRepo.advanceFuelHandoffScan(dauVong, moc(ngay))),
      );

      expect(await settlementRepo.fuelHandoffScan()).toEqual({
        position: moc(19),
        cycles: dauVong.cycles,
      });
      /* Lenh toi 19 khong the thua ai: khong lenh nao khac mang mot vi tri xa hon. */
      expect(ketQua[dich.indexOf(19)]?.advanced).toBe(true);

      /* Buoc lui, va dung cho cu, trong cung vong: khong ghi. */
      expect((await settlementRepo.advanceFuelHandoffScan(dauVong, moc(15))).advanced).toBe(false);
      expect((await settlementRepo.advanceFuelHandoffScan(dauVong, moc(19))).advanced).toBe(false);

      /*
       * `dauVong` van mang vi tri CU (`null`) trong khi ben da o 19. Mot CAS tren vi tri se tu choi
       * lan ghi duoi day; so hieu vong thi van bang, va 25 nam sau 19, nen no PHAI tien.
       */
      expect((await settlementRepo.advanceFuelHandoffScan(dauVong, moc(25))).advanced).toBe(true);
      expect(await settlementRepo.fuelHandoffScan()).toEqual({
        position: moc(25),
        cycles: dauVong.cycles,
      });
    });

    it('V-P0-23 — hang vi tri quet CHUA ton tai, chin lan tien dau tien SONG SONG: van o cho xa nhat', async () => {
      /*
       * DUONG `CREATE` cua lan tien. Khi chua ai tung quet, `UPDATE` khong cham hang nao, nen moi
       * lenh deu di tao hang: mot lenh thang, cac lenh kia nhan `P2002`. Ban truoc dung lai o
       * `P2002`, nen cho dung cuoi cung la cua lenh TAO THANG — ngau nhien — chu khong phai cho xa
       * nhat.
       *
       * Xoa hang o day an toan vi cung ly do `cleanup()` xoa duoc: chi tep nay chay vong quet tren
       * Postgres dung chung.
       */
      await prisma.transportSettlementFuelHandoffScan.deleteMany({
        where: { id: FUEL_HANDOFF_SCAN_ROW },
      });
      const tinhKhoi = await settlementRepo.fuelHandoffScan();
      expect(tinhKhoi).toEqual({ position: null, cycles: 0 });

      const moc = (ngay: number): FuelHandoffScanPosition => ({
        emittedAt: `2099-11-${String(ngay).padStart(2, '0')}T00:00:00.000Z`,
        handoffId: `it-lv-dau-tien-${ngay}`,
      });
      const dich = [21, 27, 23, 29, 25, 22, 28, 24, 26];

      await Promise.all(
        dich.map((ngay) => settlementRepo.advanceFuelHandoffScan(tinhKhoi, moc(ngay))),
      );

      expect(await settlementRepo.fuelHandoffScan()).toEqual({ position: moc(29), cycles: 0 });
    });

    /* ================================================================ *
     * V-P0-9..11 — cac bat bien phai giu
     * ================================================================ */

    it('V-P0-9 — doc nguon that bai: KHONG ghi gi (fail closed)', async () => {
      const broken = {
        latestHandoff: async () => null,
        handoffRevisions: async () => [],
        pendingHandoffs: async (): Promise<FuelHandoffFacts[]> => {
          throw new Error('CSDL ngat giua chung');
        },
      } as unknown as FuelSettlementSource;

      const summary = await buildDrain(broken).drain();
      expect(summary).toEqual({
        ingested: 0,
        alreadyCurrent: 0,
        failed: 0,
        saturated: false,
        /*
         * `wrapped: false` la mot khang dinh RIENG, khong phai mot truong cho day du.
         *
         * Mot lan doc hong bi doc nham thanh "hop thu rong" se lam vi tri quet quay ve dau — tuc
         * mot su co mang CSDL xoa sach cho dang dung cua vong quet, va moi ky dang cho o cuoi hang
         * lui lai sau ca tram ky da xong.
         */
        wrapped: false,
      });
      expect(await supplierDocuments()).toHaveLength(2);
    });

    it('V-P0-10 — ghi cong no that bai: con tro giu nguyen, khong co dau "da xong" gia', async () => {
      /*
       * Mot nguon tra ve mot ky KHONG TON TAI: `ingestFuelHandoff()` nem
       * `SETTLEMENT_DOCUMENT_NOT_FOUND`. Cai bai nay do la duong xu ly LOI, khong phai phep tinh.
       */
      const real = new FuelSettlementSourceAdapter(fuelRepo);
      const lying = {
        latestHandoff: (id: string) => real.latestHandoff(id),
        handoffRevisions: (id: string) => real.handoffRevisions(id),
        pendingHandoffs: async (): Promise<FuelHandoffFacts[]> => [
          {
            handoffId: 'it-lv-khong-ton-tai',
            reconciliationId: 'it-lv-ky-khong-ton-tai',
            revision: 1,
            supersedesId: null,
            supplierId: state.supplierId,
            periodStart: PERIOD.start,
            periodEnd: PERIOD.end,
            acceptedAmount: 1_000_000,
            currencyCode: 'VND',
            acceptedLineCount: 1,
            acceptedLineIds: ['khong-ton-tai'],
            emittedAt: '2026-09-30T12:00:00.000Z',
          },
        ],
      } as unknown as FuelSettlementSource;

      const summary = await buildDrain(lying).drain();
      expect(summary.failed).toBe(1);
      expect(summary.ingested).toBe(0);

      expect(
        await prisma.transportSettlementFuelHandoffCursor.count({
          where: { reconciliationId: 'it-lv-ky-khong-ton-tai' },
        }),
      ).toBe(0);
      expect(await supplierDocuments()).toHaveLength(2);
    });

    it('V-P0-11 — khong mot dong nao cua duong nay cham vao Quy lai xe', async () => {
      /*
       * Bat bien 1 va 3 cua `#295`. Ca bo bai tren da: nop phieu, duyet, so khop, quyet chenh lech
       * (ca ACCEPT lan IGNORE), dong ky hai lan, va quet nhieu lan. Neu bat ky duong nao trong so
       * do cham vao quy lai xe, con so duoi khong con la 0.
       */
      expect(await driverFundEntryCount()).toBe(0);
    });
  },
);
