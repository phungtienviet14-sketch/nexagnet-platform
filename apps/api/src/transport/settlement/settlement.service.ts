import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import type { BusinessDate } from '../business-date.js';
import { money } from '../money.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  calculateCommission,
  commissionRouteKey,
  selectCommissionRule,
  type CommissionCalcKind,
} from './commission-rules.js';
import { TRANSPORT_SETTLEMENT_DECISIONS } from './settlement-decisions.js';
import type { SettlementRecogniseReason } from './settlement-decisions.js';
import { SettlementOrderCompletionGate } from './settlement-order-completion.port.js';
import {
  adjustmentDelta,
  reversalAmount,
  settlementDocumentFingerprint,
  type SettlementSourceContext,
} from './settlement-documents.js';
import {
  counterpartyKindForFlow,
  directionForFlow,
  type SettlementFlow,
} from './settlement-flows.js';
import {
  assessCreditExposure,
  isOverdue,
  type CreditExposure,
} from './settlement-terms.js';
import {
  FuelSettlementSource,
  SettlementCoreFacts,
  type SettlementTripFacts,
} from './settlement.ports.js';
import { SettlementRepository, type RecogniseDocumentCommand } from './settlement.repository.js';
import type {
  CommissionCalculation,
  CommissionRule,
  CommissionRuleVersion,
  CustomerSettlementTerms,
  SettlementDocument,
  SettlementPeriod,
  SettlementPeriodStatus,
  SettlementRecognition,
} from './settlement.types.js';

/**
 * TANG UNG DUNG cua `transport-settlement` — noi giu MOI luat nghiep vu cua `TX-05`.
 *
 * ===========================================================================
 * PHAN CONG GIUA BA TANG, va ly do cua no:
 *
 *   · MIEN (`*-flows`, `*-terms`, `*-documents`, `commission-rules`, `direct-margin`) — ham thuan,
 *     khong biet DB. Chung tra loi "luat noi gi".
 *   · UNG DUNG (tep nay) — dan xep: doc su that tu cac cong, goi mien, ghi quyet dinh, roi giao
 *     MOT lenh cho kho. Tra loi "truong hop nay di duong nao".
 *   · KHO — nguyen tu hoa. Tra loi "hai nguoi ghi cung luc thi sao".
 *
 * Tang nay KHONG tu ghep nhieu loi goi kho thanh mot nghiep vu. Neu mot viec can hai lan ghi thi
 * do la MOT ham cua kho — xem khoi chu thich dau `settlement.repository.ts`.
 *
 * ===========================================================================
 * CAC BAT BIEN SETTLEMENT duoc ghi thanh MA, khong ghi thanh chu:
 *
 *   · ke toan ket thuc Order chi tao pending reconciliation, CHUA tao cong no khach chinh thuc;
 *   · A xac nhan reconciliation moi sinh `CUSTOMER_FREIGHT` receivable chinh thuc;
 *   · `TRIP_RECONCILED` chi con la khoa replay cho chung tu legacy da ton tai;
 *   · han thanh toan = ngay ghi nhan + dieu khoan cua khach;
 *   · cong no nha xe den tu MOT SO TIEN KE TOAN XAC NHAN — khong suy tu LLM, khong suy tu gia cuoc;
 *   · hoa hong chup lai ban luat luc ghi nhan.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly repository: SettlementRepository,
    private readonly core: SettlementCoreFacts,
    private readonly fuelSource: FuelSettlementSource,
    private readonly completion: SettlementOrderCompletionGate,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ================================================================== *
   * CONG KET THUC DON — `#275` K5
   * ================================================================== */

  private reportGate(
    reason: SettlementRecogniseReason,
    detail: Record<string, unknown>,
    outcome: 'allowed' | 'denied' = 'allowed',
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement.recognise',
      outcome,
      reason,
      detail,
    });
  }

  /**
   * CONG DIEU KIEN DOI SOAT — bat bien trung tam cua `#275` K5.
   *
   * Voi `CUSTOMER_FREIGHT`, ket thuc Order chi mo pending reconciliation; A xac nhan moi tao
   * receivable chinh thuc. Cac cong van hanh cu cua entry point theo trip duoc giu de bao toan
   * thu tu loi legacy, nhung entry point nay khong con duoc phep ghi chung tu moi.
   * `TRIP_RECONCILED` chi nhan dien va phat lai chung tu legacy da ton tai.
   *
   * Luong `TRIP_COMMISSION` khong thay doi va van dung cong ket thuc don nay truoc khi ghi nhan.
   *
   * ==========================================================================================
   * BON DUONG RA, VA MOI DUONG DE LAI MOT DONG TRONG SO QUYET DINH
   * ==========================================================================================
   *
   * 1. `ALREADY_SETTLED`  — da co chung tu cho dung khoa nguon nay. Day KHONG phai mot lan chon
   *    nguon moi, nen cong khong ap. Thieu duong nay, mot lan goi lai vo hai tren mot chuyen DA
   *    QUYET TOAN TU TRUOC tinh nang se NEM thay vi tra ve chung tu cu — tuc dung cai
   *    *"invalidate already-settled rows"* ma `#275` K6 cam.
   *
   * 2. `NOT_LINKED`       — nguon nay chua co DON nao lam chu the. DONG CONG.
   *
   *    Day la cho `#275` K5 sua `#273`. Ban truoc cho qua (`NOT_PROJECTED => pass`) vi chu the la
   *    VONG CHAY, va mot chuyen chua chieu thi khong co vong chay de hoi. Voi chu the la DON, lap
   *    luan do sup: mot chuyen co khach LUON co mot nghia vu thuong mai, ke ca khi B thue xe ngoai
   *    — chi la chua ai khai no. Nen cau tra loi dung khong phai "cho qua" ma la "hay khai no
   *    truoc" (`POST /transport/orders/projections/trip/:tripId`).
   *
   * 3. `BLOCKED`          — co don, va no chua du dieu kien. DONG CONG.
   *
   * 4. `APPROVED`         — di tiep.
   */
  private async requireOrderCompletion(
    trip: SettlementTripFacts,
    sourceContext: 'TRIP_RECONCILED' | 'TRIP_COMMISSION',
  ): Promise<void> {
    const settled = await this.repository.findDocumentBySource(sourceContext, trip.id);
    if (settled) {
      this.reportGate('SETTLEMENT_ORDER_COMPLETION_ALREADY_SETTLED', {
        tripId: trip.id,
        sourceContext,
        documentId: settled.id,
      });
      return;
    }

    const eligibility = await this.completion.eligibilityForTrip(trip.id);

    if (eligibility.kind === 'NO_ORDER') {
      this.reportGate('SETTLEMENT_ORDER_NOT_LINKED', { tripId: trip.id, sourceContext }, 'denied');
      throw TransportDomainError.denied(
        'SETTLEMENT_ORDER_NOT_LINKED',
        `Chuyen ${trip.code} chua co don hang nao lam chu the thuong mai; ` +
          'hay chieu chuyen sang mot nghia vu truoc khi ghi nhan cong no',
      );
    }

    if (eligibility.kind === 'BLOCKED') {
      this.reportGate(
        'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
        {
          tripId: trip.id,
          sourceContext,
          orderId: eligibility.orderId,
          orderStatus: eligibility.orderStatus,
          completionState: eligibility.state,
        },
        'denied',
      );
      throw TransportDomainError.denied(
        'SETTLEMENT_ORDER_COMPLETION_BLOCKED',
        `Don ${eligibility.orderCode} dang ${eligibility.orderStatus} va ket thuc thuong mai dang ` +
          `${eligibility.state}; chua du dieu kien dua chuyen ${trip.code} vao ky doi soat moi`,
      );
    }

    this.reportGate('SETTLEMENT_ORDER_COMPLETION_APPROVED', {
      tripId: trip.id,
      sourceContext,
      orderId: eligibility.orderId,
      acceptanceId: eligibility.acceptanceId,
    });
  }

  /**
   * Dung mot `RecogniseDocumentCommand` va tu tinh van tay.
   *
   * Van tay tinh O DAY chu khong o kho: no la mot luat MIEN (truong nao thuoc danh tinh kinh te),
   * va hai ban kho phai dung chung mot cau tra loi. Tinh o kho se cho ra hai ban troi khoi nhau.
   */
  private buildCommand(input: {
    readonly flow: SettlementFlow;
    readonly counterpartyId: string;
    readonly signedAmount: number;
    readonly currencyCode: string;
    readonly businessDate: BusinessDate;
    readonly dueDate: BusinessDate | null;
    readonly tripId: string | null;
    readonly sourceContext: SettlementSourceContext;
    readonly sourceId: string;
    readonly invoiceRef: string | null;
    readonly note: string | null;
    readonly recordedBy: string;
  }): RecogniseDocumentCommand {
    const direction = directionForFlow(input.flow);
    const counterpartyKind = counterpartyKindForFlow(input.flow);

    const sourceFingerprint = settlementDocumentFingerprint({
      direction,
      flow: input.flow,
      counterpartyKind,
      counterpartyId: input.counterpartyId,
      kind: 'ORIGINAL',
      signedAmount: input.signedAmount,
      currencyCode: input.currencyCode,
      businessDate: input.businessDate,
      dueDate: input.dueDate,
      tripId: input.tripId,
      adjustsId: null,
    });

    return {
      direction,
      flow: input.flow,
      counterpartyKind,
      counterpartyId: input.counterpartyId,
      signedAmount: input.signedAmount,
      currencyCode: input.currencyCode,
      businessDate: input.businessDate,
      dueDate: input.dueDate,
      tripId: input.tripId,
      sourceContext: input.sourceContext,
      sourceId: input.sourceId,
      sourceFingerprint,
      invoiceRef: input.invoiceRef,
      note: input.note,
      recordedBy: input.recordedBy,
    };
  }

  private reportRecognition(outcome: SettlementRecognition): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement.recognise',
      outcome: 'allowed',
      reason: outcome.replayed ? 'SETTLEMENT_IDEMPOTENT_REPLAY' : 'SETTLEMENT_RECOGNISED',
      detail: {
        documentId: outcome.document.id,
        flow: outcome.document.flow,
        direction: outcome.document.direction,
      },
    });
  }

  private async requireTrip(tripId: string): Promise<SettlementTripFacts> {
    const trip = await this.core.findTrip(tripId);
    if (!trip) {
      throw TransportDomainError.notFound(
        'SETTLEMENT_TRIP_NOT_FOUND',
        `Khong thay chuyen ${tripId}`,
      );
    }
    return trip;
  }

  /* ================================================================== *
   * DONG 3 — cong ty va khach hang
   * ================================================================== */

  /**
   * ENTRY POINT TUONG THICH NGUOC cho `CUSTOMER_FREIGHT` theo trip.
   *
   * Neu da co chung tu `TRIP_RECONCILED` tu v1 thi phat lai chinh chung tu legacy do. Neu chua co,
   * ham chi chay cac cong legacy de bao toan loi tuong thich roi tu choi tao cong no moi.
   *
   * Luong canonical: ke toan ket thuc Order -> pending reconciliation (chua co official AR) ->
   * A xac nhan tung Order hoac batch -> sinh official receivable qua customer reconciliation.
   */
  async recogniseCustomerReceivable(
    tripId: string,
    actor: string,
    options: { readonly invoiceRef?: string | null; readonly note?: string | null } = {},
  ): Promise<SettlementRecognition> {
    const trip = await this.requireTrip(tripId);

    // `TRIP_RECONCILED` chi dung de phat lai du lieu v1 da ton tai; khong tao official AR moi.
    const legacy = await this.repository.findDocumentBySource('TRIP_RECONCILED', trip.id);
    if (legacy) return { document: legacy, replayed: true };

    if (trip.status !== 'RECONCILED') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'settlement.recognise',
        outcome: 'denied',
        reason: 'SETTLEMENT_TRIP_NOT_RECONCILED',
        detail: { tripId, status: trip.status },
      });
      throw TransportDomainError.denied(
        'SETTLEMENT_TRIP_NOT_RECONCILED',
        `Chuyen ${trip.code} dang ${trip.status}; cong no khach ghi nhan khi chuyen sang RECONCILED`,
      );
    }

    if (trip.freightAmount === null) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'settlement.recognise',
        outcome: 'denied',
        reason: 'SETTLEMENT_TRIP_REVENUE_MISSING',
        detail: { tripId },
      });
      throw TransportDomainError.denied(
        'SETTLEMENT_TRIP_REVENUE_MISSING',
        `Chuyen ${trip.code} chua nhap gia cuoc`,
      );
    }

    if (!trip.customerId) {
      throw TransportDomainError.denied(
        'SETTLEMENT_COUNTERPARTY_KIND_MISMATCH',
        `Chuyen ${trip.code} khong gan khach hang nao`,
      );
    }

    // Giu cong legacy de bao toan thu tu loi; moi yeu cau van ket thuc o reconciliation-required.
    await this.requireOrderCompletion(trip, 'TRIP_RECONCILED');
    void actor;
    void options;
    throw TransportDomainError.denied(
      'SETTLEMENT_CUSTOMER_RECONCILIATION_REQUIRED',
      `Don cua chuyen ${trip.code} chi dang cho doi soat; A phai xac nhan truoc khi sinh cong no`,
    );
  }

  /* ================================================================== *
   * DONG 4 — cong ty va nha xe ngoai
   * ================================================================== */

  /**
   * GHI NHAN cong no nha xe cho mot chuyen thue ngoai. Acceptance 6.
   *
   * `carrierAmount` la DAU VAO NGHIEP VU do ke toan xac nhan — Issue #87 noi ro: *"The amount Y is
   * explicit business input or a deterministic configured rate, never LLM-invented."*
   *
   * Khong suy tu gia cuoc, khong suy tu mot ty le mac dinh nao. Mot con so doan duoc o day se tro
   * thanh mot khoan tien tra cho doi tac ma khong ai doi chieu lai voi hop dong.
   */
  async recogniseCarrierPayable(
    tripId: string,
    carrierAmount: number,
    actor: string,
    options: { readonly invoiceRef?: string | null; readonly note?: string | null } = {},
  ): Promise<SettlementRecognition> {
    const trip = await this.requireTrip(tripId);

    if (trip.kind !== 'EXTERNAL_CARRIER') {
      throw TransportDomainError.denied(
        'SETTLEMENT_TRIP_NOT_OUTSOURCED',
        `Chuyen ${trip.code} la ${trip.kind}, khong co cong no nha xe`,
      );
    }
    if (!trip.carrierPartnerId) {
      throw TransportDomainError.denied(
        'SETTLEMENT_COUNTERPARTY_KIND_MISMATCH',
        `Chuyen ${trip.code} chua gan nha xe`,
      );
    }

    /*
     * `#275` K5 "External carrier nuance" — DO LAI, khong chep gia dinh cua `#273`.
     *
     * Do duoc tren `main`: `TRIP_CARRIER_COST` la B TRA cho mot nha xe ngoai theo hop dong van tai
     * giua B va ho. Khach A khong ky vao khoan nay, va khong lai xe nao cua B cam bien nhan ve tu
     * no. Nghia vu bien nhan cua chuyen ay VAN ton tai va VAN bi chan — nhung o dong
     * `CUSTOMER_FREIGHT` cua chinh chuyen do, noi A ky nhan hang, va dong do di qua
     * `requireOrderCompletion` nhu moi dong khac.
     *
     * Cam cong ca o day nua se bat B phai co bien nhan cua khach TRUOC khi tra tien cho nha thau
     * phu cua chinh minh — mot luat chua ai dat ra, va `#275` K5 noi ro *"Do not break Carrier AP
     * without evidence"*. Nen duong nay di qua, va no de lai mot dong CO TEN trong so quyet dinh
     * thay vi im lang.
     */
    this.reportGate('SETTLEMENT_ORDER_COMPLETION_PATH_NOT_GATED', {
      tripId: trip.id,
      sourceContext: 'TRIP_CARRIER_COST',
      kind: trip.kind,
    });

    const value = money(carrierAmount);
    if (value.amount <= 0) {
      throw TransportDomainError.invalid(
        'SETTLEMENT_AMOUNT_INVALID',
        `So tien tra nha xe phai duong, nhan duoc ${value.amount}`,
      );
    }

    /*
     * Dau AM: day la mot khoan PHAI TRA. Quy uoc dau nam o MOT cho — chieu cua dong — nen khong
     * ham nao khac phai nho no.
     */
    const command = this.buildCommand({
      flow: 'CARRIER_SERVICE',
      counterpartyId: trip.carrierPartnerId,
      signedAmount: -value.amount,
      currencyCode: trip.currencyCode,
      businessDate: trip.businessDate,
      dueDate: null,
      tripId: trip.id,
      sourceContext: 'TRIP_CARRIER_COST',
      sourceId: trip.id,
      invoiceRef: options.invoiceRef ?? null,
      note: options.note ?? null,
      recordedBy: actor,
    });

    const outcome = await this.repository.recogniseDocument(command);
    this.reportRecognition(outcome);
    return outcome;
  }

  /* ================================================================== *
   * DONG 5 — cong ty va doi tac mang don
   * ================================================================== */

  /**
   * TINH VA GHI NHAN hoa hong cho mot chuyen doi tac mang don. Acceptance 7 va 8.
   *
   * Phep chon luat FAIL CLOSED: hai luat cung bac cung ap duoc thi dong cong, khong chon bua.
   */
  async recogniseCommission(
    tripId: string,
    actor: string,
  ): Promise<{
    readonly calculation: CommissionCalculation;
    readonly document: SettlementDocument;
    readonly replayed: boolean;
  }> {
    const trip = await this.requireTrip(tripId);

    if (trip.kind !== 'PARTNER_REFERRED_INTERNAL_RUN' || !trip.referrerPartnerId) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'commission.select',
        outcome: 'denied',
        reason: 'COMMISSION_TRIP_NOT_PARTNER_REFERRED',
        detail: { tripId, kind: trip.kind },
      });
      throw TransportDomainError.denied(
        'SETTLEMENT_TRIP_NOT_PARTNER_REFERRED',
        `Chuyen ${trip.code} la ${trip.kind}, khong co hoa hong doi tac`,
      );
    }
    if (trip.freightAmount === null) {
      throw TransportDomainError.denied(
        'SETTLEMENT_TRIP_REVENUE_MISSING',
        `Chuyen ${trip.code} chua nhap gia cuoc nen khong co can cu tinh hoa hong`,
      );
    }

    /*
     * `#275` K5 — hoa hong CO di qua cong, khac han cong no nha xe ngoai.
     *
     * Chuyen `PARTNER_REFERRED_INTERNAL_RUN` chay bang XE CUA B, nen no co lai xe cua B mang bien
     * nhan ve, va no co mot nghia vu thuong mai voi khach. Quy trinh chu so huu mo ta ap dung
     * nguyen ven o day.
     *
     * DAT TRUOC phep chon luat, va do la vi tri DOI XUNG voi `recogniseCustomerReceivable`: o do
     * cong nam sau cac phep kiem SU THAT CUA CHUYEN (trang thai, gia cuoc, khach) va truoc phep tra
     * cuu DINH GIA (`findCustomerTerms`). Chon luat hoa hong la mot phep dinh gia — hoi "bao nhieu
     * tien" cho mot viec chua du dieu kien vao ky la hoi mot cau khong con y nghia, va no se tra ve
     * mot ma ly do noi sai cai nguoi truc phai sua truoc.
     */
    await this.requireOrderCompletion(trip, 'TRIP_COMMISSION');

    const routeKey = commissionRouteKey(trip.originLabel, trip.destinationLabel);
    const candidates = await this.repository.listCommissionCandidates(
      trip.referrerPartnerId,
      routeKey,
    );

    const selection = selectCommissionRule(
      candidates.map((row) => ({
        ruleId: row.ruleId,
        ruleVersionId: row.id,
        version: row.version,
        partnerId: row.partnerId,
        routeKey: row.routeKey,
        calcKind: row.calcKind,
        rateBasisPoints: row.rateBasisPoints,
        fixedAmount: row.fixedAmount,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      })),
      { partnerId: trip.referrerPartnerId, routeKey, businessDate: trip.businessDate },
    );

    if (selection.outcome === 'NO_RULE') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'commission.select',
        outcome: 'denied',
        reason: 'COMMISSION_RULE_NONE_APPLICABLE',
        detail: { tripId, partnerId: trip.referrerPartnerId, routeKey },
      });
      throw TransportDomainError.denied(
        'COMMISSION_RULE_NONE_APPLICABLE',
        `Khong luat hoa hong nao ap duoc cho doi tac ${trip.referrerPartnerId} tren tuyen ${routeKey} ngay ${trip.businessDate}`,
      );
    }

    if (selection.outcome === 'AMBIGUOUS') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'commission.select',
        outcome: 'denied',
        reason: 'COMMISSION_RULE_AMBIGUOUS',
        detail: { tripId, scope: selection.scope, ruleIds: selection.ruleIds },
      });
      throw TransportDomainError.denied(
        'COMMISSION_RULE_AMBIGUOUS',
        `Hai luat cung bac ${selection.scope} cung ap duoc (${selection.ruleIds.join(', ')}). ` +
          `Dong mot trong hai lai truoc khi tinh hoa hong cho chuyen ${trip.code}`,
      );
    }

    const { rule, scope } = selection;
    const amount = calculateCommission(rule, trip.freightAmount);

    const document = this.buildCommand({
      flow: 'PARTNER_COMMISSION',
      counterpartyId: trip.referrerPartnerId,
      signedAmount: -amount.resultAmount,
      currencyCode: trip.currencyCode,
      businessDate: trip.businessDate,
      dueDate: null,
      tripId: trip.id,
      sourceContext: 'TRIP_COMMISSION',
      sourceId: trip.id,
      invoiceRef: null,
      note: null,
      recordedBy: actor,
    });

    const recorded = await this.repository.recordCommission({
      tripId: trip.id,
      partnerId: trip.referrerPartnerId,
      ruleVersionId: rule.ruleVersionId,
      ruleScopeSnapshot: scope,
      calcKindSnapshot: rule.calcKind,
      rateBasisPointsSnapshot: rule.rateBasisPoints,
      fixedAmountSnapshot: rule.fixedAmount,
      basisAmount: trip.freightAmount,
      rawAmount: amount.rawAmount,
      resultAmount: amount.resultAmount,
      businessDate: trip.businessDate,
      document,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'commission.select',
      outcome: 'allowed',
      reason: recorded.replayed ? 'COMMISSION_ALREADY_CALCULATED' : 'COMMISSION_RULE_SELECTED',
      detail: {
        tripId,
        scope,
        ruleVersionId: rule.ruleVersionId,
        resultAmount: amount.resultAmount,
      },
    });
    return recorded;
  }

  /* ================================================================== *
   * DONG 1 — cong ty va cay xang, doc HOP THU DI cua TX-04
   * ================================================================== */

  /**
   * DOC ban giao cua `TX-04` va ghi cong no cay xang. Acceptance 4 va 5.
   *
   * ===========================================================================
   * MOT KY DOI SOAT CO THE CO NHIEU BAN GIAO (T4R §2): dong, mo lai, sua so lieu, dong lai. Ban
   * dau tien la mot chung tu GOC; moi ban sau la mot ban DIEU CHINH mang CHENH LECH so voi ban
   * truoc, chu khong phai mot cong no thu hai.
   *
   * Neu moi ban giao deu tao mot chung tu goc, cay xang se bi ghi no HAI lan cho cung mot ky — va
   * so tien phai tra gap doi. Neu chi lay ban moi nhat va bo qua ban cu, thi lan dong dau da vao
   * so se bien mat khong co dong nao giai thich.
   *
   * `sourceId` la id cua BAN SUA DOI chu khong phai cua ky: nho vay hai lan goi cung mot ban giao
   * la mot lan phat lai, con mot ban giao MOI la mot ban sua trong cung chuoi.
   */
  async ingestFuelHandoff(
    reconciliationId: string,
    actor: string,
  ): Promise<{
    readonly documents: readonly SettlementDocument[];
    readonly created: number;
    readonly replayed: number;
  }> {
    const revisions = await this.fuelSource.handoffRevisions(reconciliationId);
    if (revisions.length === 0) {
      throw TransportDomainError.notFound(
        'SETTLEMENT_DOCUMENT_NOT_FOUND',
        `Ky doi soat ${reconciliationId} chua phat ban giao nao`,
      );
    }

    const ordered = [...revisions].sort((left, right) => left.revision - right.revision);
    const documents: SettlementDocument[] = [];
    let created = 0;
    let replayed = 0;
    let previousAmount = 0;
    let originalId: string | null = null;

    for (const handoff of ordered) {
      if (originalId === null) {
        const command = this.buildCommand({
          flow: 'FUEL_SUPPLIER',
          counterpartyId: handoff.supplierId,
          signedAmount: -handoff.acceptedAmount,
          currencyCode: handoff.currencyCode,
          businessDate: handoff.periodEnd,
          dueDate: null,
          tripId: null,
          sourceContext: 'FUEL_SETTLEMENT_HANDOFF',
          sourceId: handoff.handoffId,
          invoiceRef: null,
          note: `Ky doi soat ${handoff.periodStart}..${handoff.periodEnd}, ${handoff.acceptedLineCount} dong`,
          recordedBy: actor,
        });
        const outcome = await this.repository.recogniseDocument(command);
        this.reportRecognition(outcome);
        documents.push(outcome.document);
        originalId = outcome.document.id;
        if (outcome.replayed) replayed += 1;
        else created += 1;
        previousAmount = handoff.acceptedAmount;
        continue;
      }

      const delta = adjustmentDelta(-previousAmount, -handoff.acceptedAmount);
      previousAmount = handoff.acceptedAmount;
      if (delta === null) continue;

      const fingerprint = settlementDocumentFingerprint({
        direction: 'PAYABLE',
        flow: 'FUEL_SUPPLIER',
        counterpartyKind: 'FUEL_SUPPLIER',
        counterpartyId: handoff.supplierId,
        kind: 'ADJUSTMENT',
        signedAmount: delta,
        currencyCode: handoff.currencyCode,
        businessDate: handoff.periodEnd,
        dueDate: null,
        tripId: null,
        adjustsId: originalId,
      });

      const applied = await this.repository.correctDocument({
        targetId: originalId,
        kind: 'ADJUSTMENT',
        signedAmount: delta,
        businessDate: handoff.periodEnd,
        sourceContext: 'FUEL_SETTLEMENT_HANDOFF',
        sourceId: handoff.handoffId,
        sourceFingerprint: fingerprint,
        note: `Ban sua doi ${handoff.revision} cua ky ${handoff.periodStart}..${handoff.periodEnd}`,
        recordedBy: actor,
      });
      documents.push(applied.document);
      if (applied.replayed) replayed += 1;
      else created += 1;

      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'settlement.correct',
        outcome: 'allowed',
        reason: applied.replayed ? 'SETTLEMENT_IDEMPOTENT_REPLAY' : 'ADJUSTMENT_POSTED',
        detail: { documentId: applied.document.id, adjustsId: originalId, delta },
      });
    }

    return { documents, created, replayed };
  }

  /* ================================================================== *
   * SUA = GHI THEM
   * ================================================================== */

  /** GHI mot ban DIEU CHINH dua tren so tien MOI mong muon. Acceptance 11. */
  async adjustDocument(input: {
    readonly targetId: string;
    readonly desiredSignedAmount: number;
    readonly businessDate: BusinessDate;
    readonly sourceId: string;
    readonly note: string | null;
    readonly actor: string;
  }): Promise<SettlementDocument> {
    const chain = await this.repository.findChain(input.targetId);
    if (!chain) {
      throw TransportDomainError.notFound(
        'SETTLEMENT_DOCUMENT_NOT_FOUND',
        `Khong thay chung tu ${input.targetId}`,
      );
    }

    const target = chain.original;
    const delta = adjustmentDelta(chain.grossAmount, money(input.desiredSignedAmount).amount);
    if (delta === null) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
        point: 'settlement.correct',
        outcome: 'denied',
        reason: 'CORRECTION_NO_CHANGE',
        detail: { targetId: input.targetId },
      });
      throw TransportDomainError.denied(
        'SETTLEMENT_ADJUSTMENT_NO_CHANGE',
        `So tien mong muon trung so hien tai (${chain.grossAmount}); khong sinh ban dieu chinh 0 dong`,
      );
    }

    const fingerprint = settlementDocumentFingerprint({
      direction: target.direction,
      flow: target.flow,
      counterpartyKind: target.counterpartyKind,
      counterpartyId: target.counterpartyId,
      kind: 'ADJUSTMENT',
      signedAmount: delta,
      currencyCode: target.currencyCode,
      businessDate: input.businessDate,
      dueDate: target.dueDate,
      tripId: target.tripId,
      adjustsId: target.id,
    });

    const { document: correction } = await this.repository.correctDocument({
      targetId: target.id,
      kind: 'ADJUSTMENT',
      signedAmount: delta,
      businessDate: input.businessDate,
      sourceContext: 'MANUAL_ADJUSTMENT',
      sourceId: input.sourceId,
      sourceFingerprint: fingerprint,
      expectedGrossAmount: chain.grossAmount,
      note: input.note,
      recordedBy: input.actor,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement.correct',
      outcome: 'allowed',
      reason: 'ADJUSTMENT_POSTED',
      detail: { documentId: correction.id, adjustsId: target.id, delta },
    });
    return correction;
  }

  /** GHI mot ban DAO. Ban goc giu nguyen moi truong; chi `status` doi. */
  async reverseDocument(input: {
    readonly targetId: string;
    readonly businessDate: BusinessDate;
    readonly sourceId: string;
    readonly note: string | null;
    readonly actor: string;
  }): Promise<SettlementDocument> {
    const chain = await this.repository.findChain(input.targetId);
    if (!chain) {
      throw TransportDomainError.notFound(
        'SETTLEMENT_DOCUMENT_NOT_FOUND',
        `Khong thay chung tu ${input.targetId}`,
      );
    }

    const target = chain.original;
    const signedAmount = reversalAmount(chain.grossAmount);
    const fingerprint = settlementDocumentFingerprint({
      direction: target.direction,
      flow: target.flow,
      counterpartyKind: target.counterpartyKind,
      counterpartyId: target.counterpartyId,
      kind: 'REVERSAL',
      signedAmount,
      currencyCode: target.currencyCode,
      businessDate: input.businessDate,
      dueDate: target.dueDate,
      tripId: target.tripId,
      adjustsId: target.id,
    });

    const { document: reversal } = await this.repository.correctDocument({
      targetId: target.id,
      kind: 'REVERSAL',
      signedAmount,
      businessDate: input.businessDate,
      sourceContext: 'MANUAL_ADJUSTMENT',
      sourceId: input.sourceId,
      sourceFingerprint: fingerprint,
      expectedGrossAmount: chain.grossAmount,
      note: input.note,
      recordedBy: input.actor,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement.correct',
      outcome: 'allowed',
      reason: 'REVERSAL_POSTED',
      detail: { documentId: reversal.id, adjustsId: target.id },
    });
    return reversal;
  }

  /* ================================================================== *
   * PHAN BO THANH TOAN
   * ================================================================== */

  async allocate(input: {
    readonly documentId: string;
    readonly amount: number;
    readonly businessDate: BusinessDate;
    readonly method: string;
    readonly sourceId: string;
    readonly note: string | null;
    readonly actor: string;
  }): Promise<{ readonly allocationId: string; readonly replayed: boolean }> {
    const value = money(input.amount);
    if (value.amount <= 0) {
      throw TransportDomainError.invalid(
        'SETTLEMENT_AMOUNT_INVALID',
        `So tien phan bo phai duong, nhan duoc ${value.amount}`,
      );
    }

    const outcome = await this.repository.allocate({
      documentId: input.documentId,
      amount: value.amount,
      businessDate: input.businessDate,
      method: input.method,
      sourceContext: 'ALLOCATION',
      sourceId: input.sourceId,
      note: input.note,
      recordedBy: input.actor,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement.allocate',
      outcome: 'allowed',
      reason: outcome.replayed ? 'ALLOCATION_IDEMPOTENT_REPLAY' : 'ALLOCATION_POSTED',
      detail: { allocationId: outcome.allocation.id, documentId: input.documentId },
    });
    return { allocationId: outcome.allocation.id, replayed: outcome.replayed };
  }

  /* ================================================================== *
   * CANH BAO CONG NO — acceptance 3
   * ================================================================== */

  /**
   * MUC PHOI NHIEM tin dung cua mot khach. CANH BAO, khong bao gio chan.
   *
   * Chi doc dong `CUSTOMER_FREIGHT` cua DUNG khach do. Tron dong o day se lam tien cong ty no cay
   * xang tru vao han muc cua khach — dung kieu bu tru ma `GD-15` cam.
   */
  async creditExposure(customerId: string, asOf: BusinessDate): Promise<CreditExposure> {
    const [terms, chains] = await Promise.all([
      this.repository.findCustomerTerms(customerId),
      this.repository.listChains({
        direction: 'RECEIVABLE',
        flow: 'CUSTOMER_FREIGHT',
        counterpartyId: customerId,
        originalsOnly: true,
      }),
    ]);

    const open = chains.filter((chain) => chain.outstandingAmount !== 0);
    const overdue = open.filter((chain) => isOverdue(chain.original.dueDate, asOf));

    const exposure = assessCreditExposure({
      outstandingAmount: open.reduce((total, chain) => total + chain.outstandingAmount, 0),
      overdueAmount: overdue.reduce((total, chain) => total + chain.outstandingAmount, 0),
      overdueDocumentCount: overdue.length,
      creditLimit: terms?.creditLimit ?? null,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement.credit_check',
      outcome: 'allowed',
      reason: !terms
        ? 'CREDIT_TERMS_NOT_CONFIGURED'
        : exposure.warning === 'LIMIT_EXCEEDED'
          ? 'CREDIT_LIMIT_EXCEEDED'
          : exposure.warning === 'OVERDUE'
            ? 'CREDIT_OVERDUE_PRESENT'
            : 'CREDIT_CLEAR',
      detail: {
        customerId,
        outstandingAmount: exposure.outstandingAmount,
        overdueDocumentCount: exposure.overdueDocumentCount,
      },
    });

    return exposure;
  }

  /* ================================================================== *
   * DIEU KHOAN, KY, LUAT HOA HONG
   * ================================================================== */

  async setCustomerTerms(input: {
    readonly customerId: string;
    readonly paymentTermDays: number;
    readonly creditLimit: number | null;
    readonly currencyCode: string;
    readonly actor: string;
  }): Promise<CustomerSettlementTerms> {
    if (
      !Number.isInteger(input.paymentTermDays) ||
      input.paymentTermDays < 0 ||
      input.paymentTermDays > 365
    ) {
      throw TransportDomainError.invalid(
        'SETTLEMENT_TERM_DAYS_INVALID',
        `Dieu khoan thanh toan phai la so ngay nguyen trong 0..365, nhan duoc ${input.paymentTermDays}`,
      );
    }
    if (input.creditLimit !== null) money(input.creditLimit);

    return this.repository.upsertCustomerTerms({
      customerId: input.customerId,
      paymentTermDays: input.paymentTermDays,
      creditLimit: input.creditLimit,
      currencyCode: input.currencyCode,
      updatedBy: input.actor,
    });
  }

  async openPeriod(input: {
    readonly flow: SettlementFlow;
    readonly startDate: BusinessDate;
    readonly endDate: BusinessDate;
  }): Promise<SettlementPeriod> {
    if (input.endDate < input.startDate) {
      throw TransportDomainError.invalid(
        'SETTLEMENT_PERIOD_RANGE_INVALID',
        `Ngay bat dau ${input.startDate} sau ngay ket thuc ${input.endDate}`,
      );
    }
    const period = await this.repository.openPeriod(input);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement_period.transition',
      outcome: 'allowed',
      reason: 'PERIOD_OPENED',
      detail: { periodId: period.id, flow: period.flow },
    });
    return period;
  }

  async transitionPeriod(input: {
    readonly periodId: string;
    readonly to: SettlementPeriodStatus;
    readonly actor: string;
    readonly reason: string | null;
  }): Promise<SettlementPeriod> {
    const period = await this.repository.transitionPeriod(input);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_SETTLEMENT_DECISIONS,
      point: 'settlement_period.transition',
      outcome: 'allowed',
      reason:
        input.to === 'CLOSED'
          ? 'PERIOD_CLOSED'
          : input.to === 'CLOSING'
            ? 'PERIOD_CLOSING_STARTED'
            : input.to === 'REOPENED'
              ? 'PERIOD_REOPENED'
              : 'PERIOD_OPENED',
      detail: { periodId: period.id, to: input.to },
    });
    return period;
  }

  async createCommissionRule(input: {
    readonly partnerId: string | null;
    readonly routeKey: string | null;
    readonly actor: string;
  }): Promise<CommissionRule> {
    return this.repository.createCommissionRule({
      partnerId: input.partnerId,
      routeKey: input.routeKey,
      createdBy: input.actor,
    });
  }

  /**
   * CONG BO mot ban luat. Kiem hinh dang TRUOC khi cham DB.
   *
   * `CHECK` o migration da chan hinh dang sai, nhung mot loi tu DB doc len la `23514` va khong noi
   * duoc truong nao sai. Kiem o day de nguoi nhap sua duoc mot cai gi do.
   */
  async publishCommissionRuleVersion(input: {
    readonly ruleId: string;
    readonly calcKind: CommissionCalcKind;
    readonly rateBasisPoints: number | null;
    readonly fixedAmount: number | null;
    readonly effectiveFrom: BusinessDate;
    readonly effectiveTo: BusinessDate | null;
    readonly actor: string;
  }): Promise<CommissionRuleVersion> {
    if (input.calcKind === 'PERCENTAGE') {
      if (
        input.rateBasisPoints === null ||
        !Number.isInteger(input.rateBasisPoints) ||
        input.rateBasisPoints < 0 ||
        input.rateBasisPoints > 10000
      ) {
        throw TransportDomainError.invalid(
          'COMMISSION_RATE_INVALID',
          `Ty le phai la so nguyen diem co ban trong 0..10000 (0..100%), nhan duoc ${input.rateBasisPoints}`,
        );
      }
      if (input.fixedAmount !== null) {
        throw TransportDomainError.invalid(
          'COMMISSION_RATE_INVALID',
          'Luat theo ty le khong duoc khai so tien co dinh',
        );
      }
    } else {
      if (input.fixedAmount === null || money(input.fixedAmount).amount < 0) {
        throw TransportDomainError.invalid(
          'COMMISSION_RATE_INVALID',
          `Luat so tien co dinh phai khai so tien khong am, nhan duoc ${input.fixedAmount}`,
        );
      }
      if (input.rateBasisPoints !== null) {
        throw TransportDomainError.invalid(
          'COMMISSION_RATE_INVALID',
          'Luat so tien co dinh khong duoc khai ty le',
        );
      }
    }

    return this.repository.publishCommissionRuleVersion({
      ruleId: input.ruleId,
      calcKind: input.calcKind,
      rateBasisPoints: input.rateBasisPoints,
      fixedAmount: input.fixedAmount,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      publishedBy: input.actor,
    });
  }
}
