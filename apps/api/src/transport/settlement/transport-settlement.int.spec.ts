import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import {
  AcceptanceCounterpartyFactsAdapter,
  AcceptanceMovementFactsAdapter,
  NoOperationalDocumentsAdapter,
} from '../acceptance/acceptance-facts.port.js';
import { CommercialAcceptanceService } from '../acceptance/acceptance.service.js';
import { PrismaAcceptanceRepository } from '../acceptance/prisma-acceptance.repository.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaFuelRepository } from '../fuel/prisma-fuel.repository.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { PrismaSettlementRepository } from './prisma-settlement.repository.js';
import { SettlementOrderCompletionGateAdapter } from './settlement-order-completion.port.js';
import { SettlementReadService } from './settlement-read.service.js';
import { SettlementReportsController } from './settlement-reports.controller.js';
import {
  FuelSettlementSourceAdapter,
  SettlementCoreFactsAdapter,
  SettlementCostingFactsAdapter,
} from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';

/**
 * T5 — BANG CHUNG CUA `TX-05` TREN POSTGRES THAT (Issue #87).
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT chu khong phai kho in-memory:
 *
 * Phan lon nhung gi T5 hua song o RANH GIOI voi CSDL — `@@unique([sourceContext, sourceId])` cua
 * chong ghi trung, unique MOT PHAN cho "mot ban goc chi bi dao mot lan", `CHECK` hinh dang luat hoa
 * hong, va EXCLUDE chong lap ky. Kho in-memory theo dinh nghia khong co ranh gioi do: no se XANH ca
 * bon du khong cai nao ton tai. Do la bai hoc T2.1 va T4R da tra gia, va la ly do tep nay ton tai
 * ben canh `settlement-domain.spec.ts`.
 *
 * `describe.runIf` theo dung quy uoc cua repo: khong co DB thi BO QUA — chung chay o job
 * `integration` cua CI tren Postgres 16 that.
 *
 * ===========================================================================
 * RANH GIOI VOI `TX-04` trong tep nay.
 *
 * `P4`/`P5` doc mot BAN GIAO cua `TX-04`. Ban giao do duoc GIEO THANG vao bang cua T4 thay vi chay
 * lai ca duong nhap bang ke - so khop - dong ky. Ly do: viec T4 PHAT ban giao dung da co 13 bai
 * chung minh cua chinh no (`transport-fuel*.int.spec.ts`, ke ca `R3`-`R6` cho chuoi ban sua doi);
 * cai T5 phai chung minh la no DOC chuoi do dung. Gieo thang giu bai test noi ve dung mot thu, va
 * khong bien mot lan doi hinh dang cua T4 thanh mot lan do gia o day.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Quyet toan AR/AP + hoa hong + bien truc tiep tren Postgres THAT — T5',
  () => {
    const prisma = new PrismaService();
    const repo = new PrismaSettlementRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const fuelRepo = new PrismaFuelRepository(prisma);

    const core = new SettlementCoreFactsAdapter(trips);
    const costing = new SettlementCostingFactsAdapter(
      new CostingReadService(costingRepo, new TransportCoreFactsAdapter(trips, fleet)),
    );
    const fuelSource = new FuelSettlementSourceAdapter(fuelRepo);

    /**
     * CONG THAT, khong phai mot ban gia luon-cho-qua — `#275` K5.
     *
     * Day la ca diem cua viec noi day: 25 bai quyet toan dang chay o duoi PHAI di qua dung cai cong
     * ma nguoi dung se gap, tren dung CSDL that. Mot ban gia se lam bo bai nay chung minh rang cong
     * KHONG lam do gi — trong khi thu can chung minh la cong CO chan, va chi chan dung cho.
     */
    const acceptance = new CommercialAcceptanceService(
      new PrismaAcceptanceRepository(prisma),
      new AcceptanceMovementFactsAdapter(new PrismaMovementRepository(prisma)),
      new NoOperationalDocumentsAdapter(),
      new AcceptanceCounterpartyFactsAdapter(new PrismaCounterpartyRepository(prisma)),
      { timeZone: 'Asia/Ho_Chi_Minh' },
    );
    const service = new SettlementService(
      repo,
      core,
      fuelSource,
      new SettlementOrderCompletionGateAdapter(acceptance),
    );
    const read = new SettlementReadService(repo, core, costing);

    /**
     * TIEN TO KHONG LONG NHAU. `cleanup()` xoa bang `startsWith`, nen mot tien to la tien to cua
     * mot tien to khac se lam bo test nay xoa du lieu cua bo kia — va no chi lo ra khi chay CA thu
     * muc, khong bao gio lo ra khi chay rieng mot tep.
     */
    const TRIP_CODE = 'IT-T5-CHUYEN';
    const CUSTOMER_NAME = 'IT-T5-KHACH';
    const PARTNER_NAME = 'IT-T5-DOITAC';
    const SUPPLIER_CODE = 'IT-T5-CAYXANG';
    const ORDER_CODE = 'IT-T5-DONHANG';

    const ACTOR = 'IT-T5-ketoan';
    const TODAY = '2026-09-01';

    const state = {
      customerId: '',
      partnerId: '',
      supplierId: '',
      reconciliationId: '',
      tripOwn: '',
      tripOutsourced: '',
      tripReferred: '',
    };

    /**
     * THU TU XOA theo chieu khoa ngoai cua `TX-05`: anh chup hoa hong tro toi CA chung tu LAN ban
     * luat, va chung tu tro toi CHINH NO (`adjustsId`). Xoa ban sua truoc ban goc.
     */
    async function cleanup(): Promise<void> {
      const tripRows = await prisma.transportTrip.findMany({
        where: { code: { startsWith: TRIP_CODE } },
        select: { id: true },
      });
      const tripIds = tripRows.map((row) => row.id);

      await prisma.transportCommissionCalculation.deleteMany({
        where: { tripId: { in: tripIds } },
      });

      const partners = await prisma.transportPartner.findMany({
        where: { name: { startsWith: PARTNER_NAME } },
        select: { id: true },
      });
      const partnerIds = partners.map((row) => row.id);

      const rules = await prisma.transportCommissionRule.findMany({
        where: { partnerId: { in: partnerIds } },
        select: { id: true },
      });
      const ruleIds = rules.map((row) => row.id);
      await prisma.transportCommissionRuleVersion.deleteMany({
        where: { ruleId: { in: ruleIds } },
      });
      await prisma.transportCommissionRule.deleteMany({ where: { id: { in: ruleIds } } });

      const customers = await prisma.transportCustomer.findMany({
        where: { name: { startsWith: CUSTOMER_NAME } },
        select: { id: true },
      });
      const customerIds = customers.map((row) => row.id);

      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: SUPPLIER_CODE } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);

      const counterparties = [...customerIds, ...partnerIds, ...supplierIds];
      const docs = await prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: { in: counterparties } },
        select: { id: true },
      });
      const docIds = docs.map((row) => row.id);

      await prisma.transportSettlementAllocation.deleteMany({
        where: { documentId: { in: docIds } },
      });
      // Ban sua tro toi ban goc: xoa chung TRUOC.
      await prisma.transportSettlementDocument.deleteMany({
        where: { id: { in: docIds }, kind: { not: 'ORIGINAL' } },
      });
      await prisma.transportSettlementDocument.deleteMany({ where: { id: { in: docIds } } });

      await prisma.transportSettlementPeriod.deleteMany({
        where: { startDate: { startsWith: '2099' } },
      });
      await prisma.transportCustomerTerms.deleteMany({
        where: { customerId: { in: customerIds } },
      });

      const reconciliations = await prisma.transportFuelReconciliation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const reconciliationIds = reconciliations.map((row) => row.id);
      await prisma.transportFuelSettlementHandoff.deleteMany({
        where: { reconciliationId: { in: reconciliationIds } },
      });
      await prisma.transportFuelReconciliation.deleteMany({
        where: { id: { in: reconciliationIds } },
      });
      await prisma.transportFuelSupplierStatement.deleteMany({
        where: { supplierId: { in: supplierIds } },
      });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

      /*
       * `#275` Lane K — don + lien ket + ho so ket thuc cua bo bai nay.
       *
       * Trigger chi-ghi-them chan ca `DELETE` tren lich su quyet dinh, nen duong don dep phai TAT
       * no — cung khuon `transport-commercial-acceptance.int.spec.ts`. Do la bang chung rang no
       * dang bao ve that.
       */
      const orderRows = await prisma.transportOrder.findMany({
        where: { code: { startsWith: ORDER_CODE } },
        select: { id: true },
      });
      const orderIds = orderRows.map((row) => row.id);
      const acceptanceRows = await prisma.transportCommercialAcceptance.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      const acceptanceIds = acceptanceRows.map((row) => row.id);
      if (acceptanceIds.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'ALTER TABLE "TransportCommercialAcceptanceDecision" DISABLE TRIGGER "transport_commercial_acceptance_append_only"',
          );
          await tx.transportCommercialAcceptanceDecision.deleteMany({
            where: { acceptanceId: { in: acceptanceIds } },
          });
          await tx.$executeRawUnsafe(
            'ALTER TABLE "TransportCommercialAcceptanceDecision" ENABLE TRIGGER "transport_commercial_acceptance_append_only"',
          );
        });
        await prisma.transportCommercialAcceptance.deleteMany({
          where: { id: { in: acceptanceIds } },
        });
      }
      await prisma.transportTripOrderLink.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.transportOrder.deleteMany({ where: { id: { in: orderIds } } });

      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });
      await prisma.transportCustomer.deleteMany({ where: { id: { in: customerIds } } });
      await prisma.transportPartnerRole.deleteMany({ where: { partnerId: { in: partnerIds } } });
      await prisma.transportPartner.deleteMany({ where: { id: { in: partnerIds } } });
    }

    /**
     * MOT CHUYEN CO NGHIA VU THUONG MAI DA DUOC KE TOAN KET THUC — `#275` K5.
     *
     * Ba buoc, va ca ba deu la buoc THAT ma nguoi dung se di qua:
     *
     *   1. chieu chuyen sang mot don (`TransportTripOrderLink`);
     *   2. don giao xong (`FULFILLED`);
     *   3. ke toan ghi mot quyet dinh ket thuc theo can cu ban giay.
     *
     * KHONG dung SQL tho de dat thang `state = 'APPROVED'`: `#275` cam nguy tao bang cach ghi
     * thang, va mot fixture di duong tat se khong con chung minh duoc rang duong that chay duoc.
     */
    async function completeOrderFor(
      tripId: string,
      code: string,
      idempotencyKey: string,
    ): Promise<string> {
      const order = await prisma.transportOrder.create({
        data: {
          code: `${ORDER_CODE}-${code}`,
          status: 'FULFILLED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
        },
      });
      await prisma.transportTripOrderLink.create({
        data: { tripId, orderId: order.id, projectedBy: ACTOR },
      });
      await acceptance.decide({
        orderId: order.id,
        outcome: 'APPROVED',
        reasonCode: 'DOCUMENT_RECEIVED',
        basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
        evidenceRefs: [],
        externalNote: 'B giu ban goc phieu giao',
        counterpartyId: null,
        supersedesId: null,
        idempotencyKey,
        authUserId: ACTOR,
      });
      return order.id;
    }

    beforeAll(async () => {
      await cleanup();

      const customer = await prisma.transportCustomer.create({
        data: { name: `${CUSTOMER_NAME}-A` },
      });
      state.customerId = customer.id;

      /** MOT doi tac mang HAI vai (VT-054) — fixture cua acceptance 9 va 10. */
      const partner = await prisma.transportPartner.create({
        data: {
          name: `${PARTNER_NAME}-A`,
          roles: { create: [{ role: 'CARRIER' }, { role: 'ORDER_REFERRER' }] },
        },
      });
      state.partnerId = partner.id;

      const supplier = await prisma.transportFuelSupplier.create({
        data: { name: `${SUPPLIER_CODE}-A`, code: `${SUPPLIER_CODE}-01` },
      });
      state.supplierId = supplier.id;

      const own = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-OWN`,
          kind: 'OWN_DIRECT',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
          customerId: customer.id,
          freightAmount: BigInt(20_000_000),
        },
      });
      state.tripOwn = own.id;

      const outsourced = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-OUT`,
          kind: 'EXTERNAL_CARRIER',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'DN',
          customerId: customer.id,
          carrierPartnerId: partner.id,
          freightAmount: BigInt(30_000_000),
        },
      });
      state.tripOutsourced = outsourced.id;

      const referred = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-REF`,
          kind: 'PARTNER_REFERRED_INTERNAL_RUN',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
          customerId: customer.id,
          referrerPartnerId: partner.id,
          freightAmount: BigInt(10_000_000),
        },
      });
      state.tripReferred = referred.id;

      /*
       * `#275` K5 — ba chuyen tren deu di vao mot ky doi soat MOI trong bo bai duoi day, nen ca ba
       * deu phai co mot nghia vu thuong mai DA DUOC KE TOAN KET THUC. Day chinh la dieu cong moi
       * doi, va viec 25 bai quyet toan phia duoi van xanh la bang chung rang cong khong lam do mot
       * duong nao dang chay.
       */
      await completeOrderFor(own.id, 'OWN', 'it-t5-ket-thuc-own');
      await completeOrderFor(outsourced.id, 'OUT', 'it-t5-ket-thuc-out');
      await completeOrderFor(referred.id, 'REF', 'it-t5-ket-thuc-ref');

      /*
       * BAN GIAO cua `TX-04`, gieo thang — xem khoi chu thich dau tep ve ranh gioi nay.
       * Hai ban sua doi: 8.000.000 roi sua thanh 9.500.000, dung hinh dang T4R §2 sinh ra.
       */
      /*
       * `TX-04` tao bang ke va ky doi soat trong CUNG mot giao dich (T4R §3), nen luoc do bat
       * `reconciliation` phai co `statement`. Fixture o day dung dung rang buoc do thay vi lach
       * qua no — mot fixture khong dung duoc hinh dang that cua T4 se che mat chinh cho T5 doc sai.
       */
      const statement = await prisma.transportFuelSupplierStatement.create({
        data: {
          supplier: { connect: { id: supplier.id } },
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          format: 'CSV',
          sourceRef: 'IT-T5-bangke.csv',
          sourceDigest: 'it-t5-digest',
          rowCount: 3,
          acceptedCount: 3,
          rejectedCount: 0,
          importedBy: 'IT-T5-t4',
        },
      });

      const reconciliation = await prisma.transportFuelReconciliation.create({
        data: {
          supplier: { connect: { id: supplier.id } },
          statement: { connect: { id: statement.id } },
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        },
      });
      state.reconciliationId = reconciliation.id;

      const v1 = await prisma.transportFuelSettlementHandoff.create({
        data: {
          reconciliation: { connect: { id: reconciliation.id } },
          revision: 1,
          supplierId: supplier.id,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          acceptedAmount: BigInt(8_000_000),
          acceptedLineCount: 2,
          acceptedLineIds: ['line-1', 'line-2'],
          emittedBy: 'IT-T5-t4',
        },
      });

      await prisma.transportFuelSettlementHandoff.create({
        data: {
          reconciliation: { connect: { id: reconciliation.id } },
          revision: 2,
          supersedes: { connect: { id: v1.id } },
          supplierId: supplier.id,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          acceptedAmount: BigInt(9_500_000),
          acceptedLineCount: 3,
          acceptedLineIds: ['line-1', 'line-2', 'line-3'],
          emittedBy: 'IT-T5-t4',
        },
      });

      await service.setCustomerTerms({
        customerId: customer.id,
        paymentTermDays: 30,
        creditLimit: 25_000_000,
        currencyCode: 'VND',
        actor: ACTOR,
      });
    }, 60_000);

    /* ================================================================ *
     * P1, P2 — cong no khach + han thanh toan tat dinh
     * ================================================================ */

    it('P1 — chuyen da doi soat sinh DUNG MOT cong no khach', async () => {
      const first = await service.recogniseCustomerReceivable(state.tripOwn, ACTOR);
      expect(first.replayed).toBe(false);
      expect(first.document.direction).toBe('RECEIVABLE');
      expect(first.document.flow).toBe('CUSTOMER_FREIGHT');
      expect(first.document.signedAmount).toBe(20_000_000);

      const rows = await prisma.transportSettlementDocument.findMany({
        where: { tripId: state.tripOwn, sourceContext: 'TRIP_RECONCILED' },
      });
      expect(rows).toHaveLength(1);
    });

    it('P2 — dieu khoan 30 ngay cho ra han 2026-10-01', async () => {
      const doc = await prisma.transportSettlementDocument.findFirst({
        where: { tripId: state.tripOwn, sourceContext: 'TRIP_RECONCILED' },
      });
      expect(doc?.dueDate).toBe('2026-10-01');
    });

    it('P2b — goi lai cung mot chuyen la mot lan PHAT LAI, khong ghi them', async () => {
      const again = await service.recogniseCustomerReceivable(state.tripOwn, ACTOR);
      expect(again.replayed).toBe(true);

      const rows = await prisma.transportSettlementDocument.findMany({
        where: { tripId: state.tripOwn, sourceContext: 'TRIP_RECONCILED' },
      });
      expect(rows).toHaveLength(1);
    });

    /* ================================================================ *
     * P3 — canh bao cong no, KHONG chan
     * ================================================================ */

    it('P3 — vuot han muc chi CANH BAO; khong lenh nao bi chan', async () => {
      const exposure = await service.creditExposure(state.customerId, TODAY);
      expect(exposure.outstandingAmount).toBe(20_000_000);
      expect(exposure.warning).toBe('NONE');

      // Them cong no cua chuyen thue ngoai (30tr) -> tong 50tr, vuot han muc 25tr.
      await service.recogniseCustomerReceivable(state.tripOutsourced, ACTOR);
      const after = await service.creditExposure(state.customerId, TODAY);
      expect(after.outstandingAmount).toBe(50_000_000);
      expect(after.warning).toBe('LIMIT_EXCEEDED');
      expect(after.headroomAmount).toBe(-25_000_000);

      /*
       * VA CHUYEN VAN GHI NHAN DUOC. Day la ca noi dung cua acceptance 3: canh bao la mot NHAN,
       * khong phai mot cong. Neu dong nay nem thi T5 da bien mot canh bao thanh mot lenh chan.
       */
      const referred = await service.recogniseCustomerReceivable(state.tripReferred, ACTOR);
      expect(referred.document.signedAmount).toBe(10_000_000);
    });

    /* ================================================================ *
     * P4, P5 — ban giao cua TX-04 sinh cong no cay xang
     * ================================================================ */

    it('P4 — ban giao cua TX-04 sinh MOT cong no goc + MOT ban dieu chinh', async () => {
      const outcome = await service.ingestFuelHandoff(state.reconciliationId, ACTOR);

      const originals = await prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: state.supplierId, kind: 'ORIGINAL' },
      });
      expect(originals).toHaveLength(1);
      expect(Number(originals[0]!.signedAmount)).toBe(-8_000_000);

      const adjustments = await prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: state.supplierId, kind: 'ADJUSTMENT' },
      });
      expect(adjustments).toHaveLength(1);
      // 9,5tr - 8tr = 1,5tr no THEM, tuc chenh lech AM o chieu PAYABLE.
      expect(Number(adjustments[0]!.signedAmount)).toBe(-1_500_000);
      expect(outcome.created).toBe(2);

      const chain = await read.documentChain(originals[0]!.id);
      expect(chain?.grossAmount).toBe(-9_500_000);
    });

    it('P5 — nap lai cung ky KHONG sinh chung tu trung', async () => {
      await service.ingestFuelHandoff(state.reconciliationId, ACTOR);

      const all = await prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: state.supplierId },
      });
      expect(all).toHaveLength(2);
    });

    /* ================================================================ *
     * P6 — bien truc tiep chuyen thue ngoai
     * ================================================================ */

    it('P6 — chuyen thue ngoai X/Y cho bien X-Y, khong chi phi noi bo', async () => {
      await service.recogniseCarrierPayable(state.tripOutsourced, 22_000_000, ACTOR);

      const margin = await read.tripDirectMargin(state.tripOutsourced);
      expect(margin?.revenueAmount).toBe(30_000_000);
      expect(margin?.carrierPayableAmount).toBe(22_000_000);
      expect(margin?.marginAmount).toBe(8_000_000);
      expect(margin?.unexpectedInternalCost).toBe(false);
    });

    /* ================================================================ *
     * P7, P8 — hoa hong + anh chup ban luat
     * ================================================================ */

    it('P7 — chuyen doi tac mang don sinh hoa hong kem ANH CHUP ban luat', async () => {
      const rule = await service.createCommissionRule({
        partnerId: state.partnerId,
        routeKey: null,
        actor: ACTOR,
      });
      await service.publishCommissionRuleVersion({
        ruleId: rule.id,
        calcKind: 'PERCENTAGE',
        rateBasisPoints: 500,
        fixedAmount: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        actor: ACTOR,
      });

      const recorded = await service.recogniseCommission(state.tripReferred, ACTOR);
      expect(recorded.calculation.resultAmount).toBe(500_000);
      expect(recorded.calculation.rateBasisPointsSnapshot).toBe(500);
      expect(recorded.calculation.ruleScopeSnapshot).toBe('PARTNER');
      expect(recorded.calculation.basisAmount).toBe(10_000_000);
      expect(recorded.document.flow).toBe('PARTNER_COMMISSION');
      expect(recorded.document.signedAmount).toBe(-500_000);
    });

    it('P8 — cong bo ban luat MOI khong doi so tien da quyet toan', async () => {
      const rule = await repo.findCommissionRuleByScope(state.partnerId, null);
      await service.publishCommissionRuleVersion({
        ruleId: rule!.id,
        calcKind: 'PERCENTAGE',
        rateBasisPoints: 900,
        fixedAmount: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        actor: ACTOR,
      });

      const stored = await repo.findCommissionByTrip(state.tripReferred);
      expect(stored?.resultAmount).toBe(500_000);
      expect(stored?.rateBasisPointsSnapshot).toBe(500);
    });

    it('P8b — hai luat CUNG BAC cung ap duoc => tu choi, khong chon bua', async () => {
      const other = await prisma.transportPartner.create({
        data: { name: `${PARTNER_NAME}-B`, roles: { create: [{ role: 'ORDER_REFERRER' }] } },
      });
      const trip = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-AMB`,
          kind: 'PARTNER_REFERRED_INTERNAL_RUN',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
          referrerPartnerId: other.id,
          freightAmount: BigInt(5_000_000),
        },
      });

      const rule = await service.createCommissionRule({
        partnerId: other.id,
        routeKey: null,
        actor: ACTOR,
      });
      // Hai BAN cua cung mot luat, khoang hieu luc CHONG LAP — nhap nhang that su de xay ra.
      await service.publishCommissionRuleVersion({
        ruleId: rule.id,
        calcKind: 'PERCENTAGE',
        rateBasisPoints: 300,
        fixedAmount: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        actor: ACTOR,
      });
      await service.publishCommissionRuleVersion({
        ruleId: rule.id,
        calcKind: 'PERCENTAGE',
        rateBasisPoints: 700,
        fixedAmount: null,
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
        actor: ACTOR,
      });

      // Cong ket thuc don chay TRUOC phep chon luat, nen chuyen nay cung phai qua duoc no —
      // neu khong, bai se do o `SETTLEMENT_ORDER_NOT_LINKED` va khong con noi gi ve luat hoa hong.
      await completeOrderFor(trip.id, 'AMB', 'it-t5-ket-thuc-amb');

      await expect(service.recogniseCommission(trip.id, ACTOR)).rejects.toMatchObject({
        reason: 'COMMISSION_RULE_AMBIGUOUS',
      });

      const written = await prisma.transportCommissionCalculation.findMany({
        where: { tripId: trip.id },
      });
      expect(written).toHaveLength(0);
    });

    /* ================================================================ *
     * P9, P10 — mot doi tac hai vai; net la HIEN THI
     * ================================================================ */

    it('P9 — cung mot doi tac giu cong no nha xe VA hoa hong RIENG', async () => {
      const carrier = await read.apByCounterparty('CARRIER_SERVICE');
      const commission = await read.apByCounterparty('PARTNER_COMMISSION');

      const carrierRow = carrier.find((row) => row.counterpartyId === state.partnerId);
      const commissionRow = commission.find((row) => row.counterpartyId === state.partnerId);

      expect(carrierRow?.outstandingAmount).toBe(22_000_000);
      expect(commissionRow?.outstandingAmount).toBe(500_000);
      // Hai so cai rieng biet — khong mot bang nao gop chung lai.
      expect(carrierRow?.flow).not.toBe(commissionRow?.flow);
    });

    it('P10 — cot net KHONG xoa hai chieu goc', async () => {
      const position = await read.partnerPosition(state.partnerId);
      expect(position.carrierPayableAmount).toBe(22_000_000);
      expect(position.commissionPayableAmount).toBe(500_000);
      expect(position.receivableAmount).toBe(0);
      expect(position.netDisplay).toBe(-22_500_000);
    });

    /* ================================================================ *
     * P11 — sua = ghi them
     * ================================================================ */

    it('P11 — ban dieu chinh giu NGUYEN ban goc', async () => {
      const original = await prisma.transportSettlementDocument.findFirst({
        where: { tripId: state.tripOwn, kind: 'ORIGINAL' },
      });
      const beforeAmount = Number(original!.signedAmount);

      await service.adjustDocument({
        targetId: original!.id,
        desiredSignedAmount: 21_000_000,
        businessDate: TODAY,
        sourceId: `IT-T5-adj-${original!.id}`,
        note: 'Khach chap nhan phu phi',
        actor: ACTOR,
      });

      const after = await prisma.transportSettlementDocument.findUnique({
        where: { id: original!.id },
      });
      expect(Number(after!.signedAmount)).toBe(beforeAmount);
      expect(after!.status).toBe('POSTED');

      const chain = await read.documentChain(original!.id);
      expect(chain?.corrections).toHaveLength(1);
      expect(chain?.corrections[0]!.signedAmount).toBe(1_000_000);
      expect(chain?.grossAmount).toBe(21_000_000);
    });

    it('P11b — mot ban goc chi bi DAO mot lan', async () => {
      const original = await prisma.transportSettlementDocument.findFirst({
        where: { tripId: state.tripReferred, kind: 'ORIGINAL', flow: 'CUSTOMER_FREIGHT' },
      });

      await service.reverseDocument({
        targetId: original!.id,
        businessDate: TODAY,
        sourceId: `IT-T5-rev-${original!.id}`,
        note: 'Huy cuoc',
        actor: ACTOR,
      });

      const reversed = await prisma.transportSettlementDocument.findUnique({
        where: { id: original!.id },
      });
      expect(reversed!.status).toBe('REVERSED');

      await expect(
        service.reverseDocument({
          targetId: original!.id,
          businessDate: TODAY,
          sourceId: `IT-T5-rev2-${original!.id}`,
          note: null,
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ reason: 'SETTLEMENT_TARGET_ALREADY_REVERSED' });

      const chain = await read.documentChain(original!.id);
      expect(chain?.grossAmount).toBe(0);
    });

    /* ================================================================ *
     * P12 — GD-13: phan bo chi phi co dinh TAT
     * ================================================================ */

    it('P12 — moi con so bien deu khai bao chua gom chi phi co dinh', async () => {
      const margin = await read.tripDirectMargin(state.tripOwn);
      expect(margin?.fixedCostsIncluded).toBe(false);
      expect(margin?.disclosure).toBe('Chưa gồm chi phí cố định');

      const rollup = await read.directMarginRollup([state.tripOwn, state.tripOutsourced]);
      expect(rollup.fixedCostsIncluded).toBe(false);
      expect(rollup.disclosure).toBe('Chưa gồm chi phí cố định');
    });

    /* ================================================================ *
     * P13 — ben vung qua mot ket noi MOI
     * ================================================================ */

    it('P13 — doc lai bang mot ket noi MOI cho ra dung trang thai da chot', async () => {
      const fresh = new PrismaService();
      const freshTrips = new PrismaTripRepository(fresh);
      const freshRepo = new PrismaSettlementRepository(fresh);
      const freshRead = new SettlementReadService(
        freshRepo,
        new SettlementCoreFactsAdapter(freshTrips),
        new SettlementCostingFactsAdapter(
          new CostingReadService(
            new PrismaCostingRepository(fresh),
            new TransportCoreFactsAdapter(freshTrips, new PrismaFleetRepository(fresh)),
          ),
        ),
      );

      const aging = await freshRead.arAging(TODAY, state.customerId);
      // Chuyen xe nha 21tr (da dieu chinh) + chuyen thue ngoai 30tr; chuyen doi tac da bi DAO.
      expect(aging.outstandingTotal).toBe(51_000_000);
      expect(aging.rows.every((row) => row.bucket === 'CURRENT')).toBe(true);

      const commission = await freshRepo.findCommissionByTrip(state.tripReferred);
      expect(commission?.resultAmount).toBe(500_000);
      expect(commission?.rateBasisPointsSnapshot).toBe(500);

      await fresh.$disconnect();
    });

    /* ================================================================ *
     * KY DONG BANG — "closed period rejects silent backdated mutation"
     * ================================================================ */

    it('KY — ky da dong tu choi chung tu lui ngay', async () => {
      const period = await service.openPeriod({
        flow: 'CUSTOMER_FREIGHT',
        startDate: '2099-01-01',
        endDate: '2099-01-31',
      });
      await service.transitionPeriod({
        periodId: period.id,
        to: 'CLOSING',
        actor: ACTOR,
        reason: null,
      });
      await service.transitionPeriod({
        periodId: period.id,
        to: 'CLOSED',
        actor: ACTOR,
        reason: null,
      });

      const trip = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-FROZEN`,
          kind: 'OWN_DIRECT',
          status: 'RECONCILED',
          businessDate: '2099-01-15',
          originLabel: 'HN',
          destinationLabel: 'HP',
          customerId: state.customerId,
          freightAmount: BigInt(1_000_000),
        },
      });

      // Cung ly do: cong ket thuc don chay truoc khi kho cham toi ky bi dong.
      await completeOrderFor(trip.id, 'FROZEN', 'it-t5-ket-thuc-frozen');

      await expect(service.recogniseCustomerReceivable(trip.id, ACTOR)).rejects.toMatchObject({
        reason: 'SETTLEMENT_PERIOD_FROZEN',
      });

      const written = await prisma.transportSettlementDocument.findMany({
        where: { tripId: trip.id },
      });
      expect(written).toHaveLength(0);
    });

    it('KY — hai ky chong lap trong cung mot dong bi DB chan', async () => {
      await expect(
        service.openPeriod({
          flow: 'CUSTOMER_FREIGHT',
          startDate: '2099-01-15',
          endDate: '2099-02-15',
        }),
      ).rejects.toMatchObject({ reason: 'SETTLEMENT_PERIOD_OVERLAP' });
    });

    /* ================================================================ *
     * P14 — `#168 B1`: BE MAT HTTP doc dung nhung con so nay
     *
     * Cac bai P1-P13 chung minh tang DOC dung tren Postgres that. Bai nay chung minh mot dieu khac
     * han, va la dieu duy nhat T7B them vao: cai ma NGUOI DUNG goi qua HTTP tra ve DUNG nhung con
     * so do — khong phai mot ban da bi controller nan lai, cat bot, hay gop chung.
     *
     * Dung chinh `read` da dung o tren chu khong mot ban gia: neu controller lo tay goi sai tham so
     * hay doi hinh dang ket qua, bai nay do duoc; mot mock thi khong.
     * ================================================================ */
    const controller = new SettlementReportsController(read);

    it('P14a — AR aging qua HTTP tra dung bao cao cua tang doc', async () => {
      const viaHttp = await controller.arAging({ asOf: TODAY });

      expect(viaHttp).toEqual(await read.arAging(TODAY));
      // ...va no thuc su co du lieu, nen phep so sanh tren khong phai hai bang rong bang nhau.
      expect(viaHttp.rows.length).toBeGreaterThan(0);
      expect(viaHttp.asOf).toBe(TODAY);
    });

    it('P14b — loc theo khach cua HTTP di dung xuong tang doc', async () => {
      const viaHttp = await controller.arAging({ asOf: TODAY, customerId: state.customerId });

      expect(viaHttp).toEqual(await read.arAging(TODAY, state.customerId));
      for (const row of viaHttp.rows) expect(row.counterpartyId).toBe(state.customerId);
    });

    /**
     * `GD-15` do TREN DAY, khong chi trong don vi: mot doi tac giu CA cong no nha xe LAN hoa hong,
     * va ca hai con so goc phai den duoc nguoi doc canh nhau.
     */
    it('P14c — vi the doi tac qua HTTP giu ca hai chieu, khong bu tru', async () => {
      const position = await controller.partnerPosition(state.partnerId);

      expect(position).toEqual(await read.partnerPosition(state.partnerId));
      expect(position.carrierPayableAmount).toBeGreaterThan(0);
      expect(position.commissionPayableAmount).toBeGreaterThan(0);
      expect(position.netDisplay).toBe(
        position.receivableAmount -
          (position.carrierPayableAmount + position.commissionPayableAmount),
      );
    });

    it('P14d — cong no phai tra qua HTTP giu RIENG tung dong', async () => {
      const carrier = await controller.apByCounterparty({ flow: 'CARRIER_SERVICE' });
      const commission = await controller.apByCounterparty({ flow: 'PARTNER_COMMISSION' });

      expect(carrier).toEqual(await read.apByCounterparty('CARRIER_SERVICE'));
      for (const row of carrier) expect(row.flow).toBe('CARRIER_SERVICE');
      for (const row of commission) expect(row.flow).toBe('PARTNER_COMMISSION');
    });

    it('P14e — bien truc tiep cua mot chuyen qua HTTP', async () => {
      const margin = await controller.tripDirectMargin(state.tripOutsourced);
      expect(margin).toEqual(await read.tripDirectMargin(state.tripOutsourced));
    });

    it('P14f — chuyen KHONG ton tai ra 404, khong phai than null mang ma 200', async () => {
      await expect(controller.tripDirectMargin('IT-T5-khong-co-that')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('P14g — cong don qua HTTP bang tong cua hai chuyen doc rieng', async () => {
      const rollup = await controller.directMarginRollup({
        tripIds: `${state.tripOwn},${state.tripOutsourced}`,
      });

      expect(rollup).toEqual(await read.directMarginRollup([state.tripOwn, state.tripOutsourced]));
    });

    /* ================================================================ *
     * K5 — CONG KET THUC DON, tren Postgres THAT
     * ================================================================ */

    /**
     * `#275` K5 tren CSDL that, di qua dung cai cong ma nguoi dung se gap.
     *
     * Ba bai o duoi phu ba nhanh cua cong, va ca ba deu dung `SettlementService` DA duoc noi voi
     * `CommercialAcceptanceService` that o dau tep — khong mot ban gia nao.
     */
    it('K5 — chuyen KHONG co don lam chu the bi CHAN, khong con duong vong `NOT_PROJECTED`', async () => {
      const trip = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-KHONGDON`,
          kind: 'OWN_DIRECT',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
          customerId: state.customerId,
          freightAmount: BigInt(4_000_000),
        },
      });

      await expect(service.recogniseCustomerReceivable(trip.id, ACTOR)).rejects.toMatchObject({
        reason: 'SETTLEMENT_ORDER_NOT_LINKED',
      });

      const written = await prisma.transportSettlementDocument.findMany({
        where: { tripId: trip.id },
      });
      expect(written).toHaveLength(0);
    });

    it('K5 — chuyen CO don nhung chua ai ket thuc thi bi CHAN', async () => {
      const trip = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-CHOKETTHUC`,
          kind: 'OWN_DIRECT',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
          customerId: state.customerId,
          freightAmount: BigInt(6_000_000),
        },
      });
      const order = await prisma.transportOrder.create({
        data: {
          code: `${ORDER_CODE}-CHO`,
          status: 'FULFILLED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
        },
      });
      await prisma.transportTripOrderLink.create({
        data: { tripId: trip.id, orderId: order.id, projectedBy: ACTOR },
      });

      await expect(service.recogniseCustomerReceivable(trip.id, ACTOR)).rejects.toMatchObject({
        reason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
      });

      /*
       * VA SAU KHI KE TOAN BAM `Da ket thuc` THI DI QUA — cung mot chuyen, cung mot lenh, chi khac
       * mot quyet dinh cua nguoi. Do la ca noi dung cua `#275` K5 tren du lieu that.
       */
      await acceptance.decide({
        orderId: order.id,
        outcome: 'APPROVED',
        reasonCode: 'DOCUMENT_RECEIVED',
        basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
        evidenceRefs: [],
        externalNote: 'B giu ban goc phieu giao',
        counterpartyId: null,
        supersedesId: null,
        idempotencyKey: 'it-t5-ket-thuc-cho',
        authUserId: ACTOR,
      });

      const outcome = await service.recogniseCustomerReceivable(trip.id, ACTOR);
      expect(outcome.replayed).toBe(false);
      expect(outcome.document.signedAmount).toBe(6_000_000);

      // DUNG MOT LAN: goi lai tra ve chinh ban cu.
      const again = await service.recogniseCustomerReceivable(trip.id, ACTOR);
      expect(again.replayed).toBe(true);
      expect(again.document.id).toBe(outcome.document.id);
      expect(await prisma.transportSettlementDocument.count({ where: { tripId: trip.id } })).toBe(
        1,
      );
    });

    /**
     * `#275` K7 — DONG VONG CHAY KHONG KET THUC DON NAO.
     *
     * Mot vong chay `COMPLETED` treo tren dung cai don o tren. Neu cong con doc trang thai vong
     * chay o bat cu dau, don nay se tu nhien du dieu kien — bai nay do neu dieu do xay ra.
     */
    it('K7 — vong chay dong lai khong lam mot don dang cho tro nen du dieu kien', async () => {
      const vehicle = await prisma.transportVehicle.create({
        data: { registrationPlate: `${ORDER_CODE}-XE`, vehicleClass: 'DAU_KEO' },
      });
      const trip = await prisma.transportTrip.create({
        data: {
          code: `${TRIP_CODE}-RUNDONG`,
          kind: 'OWN_DIRECT',
          status: 'RECONCILED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
          customerId: state.customerId,
          freightAmount: BigInt(7_000_000),
        },
      });
      const order = await prisma.transportOrder.create({
        data: {
          code: `${ORDER_CODE}-RUNDONG`,
          status: 'FULFILLED',
          businessDate: TODAY,
          originLabel: 'HN',
          destinationLabel: 'HP',
        },
      });
      await prisma.transportTripOrderLink.create({
        data: { tripId: trip.id, orderId: order.id, projectedBy: ACTOR },
      });
      const run = await prisma.transportVehicleRun.create({
        data: {
          code: `${ORDER_CODE}-VONGCHAY`,
          vehicleId: vehicle.id,
          status: 'COMPLETED',
          businessDate: TODAY,
          completedAt: new Date(),
        },
      });
      await prisma.transportRunLeg.create({
        data: {
          runId: run.id,
          sequence: 1,
          kind: 'LOADED',
          orderId: order.id,
          originLabel: 'HN',
          destinationLabel: 'HP',
          businessDate: TODAY,
        },
      });

      // Vong chay DA DONG, va don van CHUA du dieu kien — chua ai bam `Da ket thuc`.
      await expect(service.recogniseCustomerReceivable(trip.id, ACTOR)).rejects.toMatchObject({
        reason: 'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
      });

      await prisma.transportRunLeg.deleteMany({ where: { runId: run.id } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: run.id } });
      await prisma.transportVehicle.deleteMany({ where: { id: vehicle.id } });
    });
  },
);
