import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS } from './acceptance-decisions.js';
import type { CommercialAcceptanceDecideReason } from './acceptance-decisions.js';
import {
  AcceptanceCounterpartyFacts,
  AcceptanceEvidenceFacts,
  AcceptanceMovementFacts,
  type AcceptanceOrderFacts,
} from './acceptance-facts.port.js';
import {
  evaluateAcceptanceDecision,
  isOrderCompletable,
  isSettlementEligible,
} from './acceptance-lifecycle.js';
import { AcceptanceRepository } from './acceptance.repository.js';
import type {
  CommercialAcceptanceDetail,
  CommercialAcceptanceQueueRow,
  CommercialAcceptanceState,
  OrderCompletionEligibility,
  RecordAcceptanceDecisionCommand,
} from './acceptance.types.js';

/**
 * TANG UNG DUNG cua `transport-acceptance` — `#275` Lane K.
 *
 * ============================================================================================
 * DICH VU NAY KHONG CAM MOT CAI BUT NAO NGOAI BUT CUA CHINH NO
 * ============================================================================================
 *
 * No tiem DUNG MOT kho ghi (`AcceptanceRepository`) va ba cong CHI DOC. Do khong phai mot lua chon
 * ve kien truc cho dep — do la cach `#275` K3 duoc giu bang CAU TRUC:
 *
 *     *"ACCOUNTING may decide Order completion but may NOT mutate the source checkpoint / GPS proof
 *     / receipt File they are reviewing"*
 *
 * Neu bat bien do chi song trong bang phan quyen, thi mot lan sua sau nay them mot loi goi ghi vao
 * day se pha no ma khong bai test nao do duoc. Vi dich vu KHONG CO tham chieu nao toi
 * `CheckpointRepository` hay `OperationalProofRepository`, cai ma no khong lam duoc thi no khong
 * lam duoc — ke ca khi ai do muon.
 *
 * (Tang phan quyen van giu phan cua no: `transport.checkpoint.record` va `transport.proof.withdraw`
 * deu nam trong `ACCOUNTING_DENIED` tu truoc lane nay. Hai lop, doc lap nhau.)
 *
 * ============================================================================================
 * DANH TINH TU PHIEN, GIO TU MAY CHU
 * ============================================================================================
 *
 * `decidedBy` den tu `command.authUserId`, ma controller lay bang `requireAuthUserId(request)` —
 * KHONG tu than yeu cau (`#275` K1: *"`decidedBy`, role and server time must never come from caller
 * payload"*). `decidedAt` do dich vu nay dat tu `TRANSPORT_CLOCK` (`#275` K8 bai 16).
 *
 * Ca hai deu duoc giu bang KIEU chu khong bang mot phep kiem: `RecordAcceptanceDecisionCommand`
 * khong co truong nao de ben goi dat hai gia tri do.
 */
@Injectable()
export class CommercialAcceptanceService {
  constructor(
    private readonly repository: AcceptanceRepository,
    private readonly movement: AcceptanceMovementFacts,
    private readonly evidence: AcceptanceEvidenceFacts,
    private readonly counterparties: AcceptanceCounterpartyFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private deny(reason: CommercialAcceptanceDecideReason, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS,
      point: 'commercial_acceptance.decide',
      outcome: 'denied',
      reason,
      detail,
    });
  }

  private async requireOrder(orderId: string): Promise<AcceptanceOrderFacts> {
    const order = await this.movement.findOrder(orderId);
    if (!order) {
      this.deny('ACCEPTANCE_ORDER_NOT_FOUND', { orderId });
      throw TransportDomainError.notFound(
        'ACCEPTANCE_ORDER_NOT_FOUND',
        `Khong thay don ${orderId}`,
      );
    }
    return order;
  }

  /**
   * GHI mot quyet dinh ket thuc don.
   *
   * THU TU la mot phan cua hop dong: don -> phap nhan -> chung cu -> luat mien -> ghi.
   *
   * Chung cu duoc LOC TRUOC khi vao luat mien, va do la ca diem cua `#275` K8 bai 6 va 7. Neu luat
   * mien nhan so luong khoa MA BEN GOI GUI, thi mot nguoi go dai ba chuoi bat ky se qua duoc dieu
   * kien "co it nhat mot chung tu". Cai di vao luat la so khoa DA XAC MINH thuoc ve dung don nay.
   */
  async decide(command: RecordAcceptanceDecisionCommand): Promise<CommercialAcceptanceDetail> {
    const order = await this.requireOrder(command.orderId);

    /*
     * TRANG THAI DON di TRUOC moi phep kiem khac — `acceptance-lifecycle.ts` dat ra thu tu do va o
     * day no phai duoc giu, khong chi o ham thuan. Neu de phep kiem chung cu chay truoc, mot lenh
     * tren mot don CHUA GIAO XONG se bao "chung tu khong thuoc don nay" thay vi "don chua giao
     * xong" — mot cau tra loi dung ve ky thuat va sai ve nguyen nhan.
     *
     * KHONG mot dong nao o day doc trang thai vong chay. `#275` K7: mot vong chay dang chay van cho
     * phep ket thuc don da giao, va mot vong chay da dong khong tu no ket thuc don nao.
     */
    if (order.status === 'CANCELLED') {
      this.deny('ACCEPTANCE_ORDER_CANCELLED', { orderId: order.id });
      throw TransportDomainError.denied(
        'ACCEPTANCE_ORDER_CANCELLED',
        `Don ${order.code} da bi huy; khong ket thuc thuong mai duoc`,
      );
    }
    if (!isOrderCompletable(order.status)) {
      this.deny('ACCEPTANCE_ORDER_NOT_FULFILLED', { orderId: order.id, status: order.status });
      throw TransportDomainError.denied(
        'ACCEPTANCE_ORDER_NOT_FULFILLED',
        `Don ${order.code} dang ${order.status}; chua giao xong nen chua co gi de ket thuc`,
      );
    }

    /*
     * PHAT LAI di TRUOC cong nghiep vu, va do la mot sua loi that chu khong phai mot toi uu.
     *
     * `#275` K8 bai 4 doi *"Same idempotency key retry => one decision/effect"*. Neu cong nghiep vu
     * chay truoc, thi lan gui lai cua MOT lenh da ghi thanh cong se va vao
     * `ACCEPTANCE_ALREADY_IN_OUTCOME` — tuc mot lan bam lai sau khi mat mang bi bao la loi, dung
     * luc nguoi dung khong biet lan dau co vao hay khong. Mot lan phat lai KHONG phai mot quyet
     * dinh moi, nen no khong di qua cong danh cho quyet dinh moi.
     */
    const history = await this.repository.findDetailByOrder(order.id);
    const replay = history?.decisions.find(
      (entry) => entry.idempotencyKey === command.idempotencyKey,
    );
    if (history && replay) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS,
        point: 'commercial_acceptance.decide',
        outcome: 'allowed',
        reason: 'ACCEPTANCE_REPLAYED',
        detail: { orderId: order.id, acceptanceId: history.acceptance.id, decisionId: replay.id },
      });
      return history;
    }

    if (
      command.counterpartyId !== null &&
      !(await this.counterparties.exists(command.counterpartyId))
    ) {
      throw TransportDomainError.invalid(
        'ACCEPTANCE_COUNTERPARTY_NOT_FOUND',
        `Khong thay phap nhan ${command.counterpartyId}`,
      );
    }

    const owned =
      command.evidenceRefs.length === 0
        ? []
        : await this.evidence.belongingTo(order.id, command.evidenceRefs);

    if (owned.length !== command.evidenceRefs.length) {
      /*
       * KHONG ke ten khoa nao bi loai. `#275` K8 bai 7 (*"Foreign/unknown evidence fails closed
       * without useful enumeration"*): mot thong bao noi "khoa X khong thuoc don nay" xac nhan rang
       * khoa X TON TAI o dau do — tuc bien cong nay thanh mot may do danh sach chung tu cua don
       * khac.
       */
      this.deny('ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER', {
        orderId: order.id,
        requested: command.evidenceRefs.length,
        accepted: owned.length,
      });
      throw TransportDomainError.denied(
        'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER',
        'Chung tu duoc tro toi khong thuoc don nay',
      );
    }

    const current = history?.acceptance ?? null;
    const externalNote = command.externalNote?.trim() ?? null;

    const verdict = evaluateAcceptanceDecision({
      outcome: command.outcome,
      basis: command.basis,
      orderStatus: order.status,
      currentState: current?.state ?? 'PENDING',
      latestDecisionId: current?.latestDecisionId ?? null,
      supersedesId: command.supersedesId,
      evidenceCount: owned.length,
      externalNote,
    });

    if (!verdict.allowed) {
      this.deny(verdict.reason, { orderId: order.id, outcome: command.outcome });
      throw verdict.reason === 'ACCEPTANCE_SUPERSEDES_STALE'
        ? TransportDomainError.conflict(
            verdict.reason,
            'Co nguoi vua ghi mot quyet dinh moi hon — hay tai lai roi quyet lai',
          )
        : TransportDomainError.denied(
            verdict.reason,
            `Khong ghi duoc quyet dinh ket thuc cho don ${order.code}`,
          );
    }

    const at = this.now();
    const outcome = await this.repository.append({
      orderId: order.id,
      outcome: command.outcome,
      reasonCode: command.reasonCode,
      basis: command.basis,
      evidenceRefs: owned,
      externalNote,
      counterpartyId: command.counterpartyId,
      supersedesId: command.supersedesId,
      idempotencyKey: command.idempotencyKey,
      decidedBy: command.authUserId,
      decidedAt: at,
      businessDate: toBusinessDate(at, this.corePolicy.timeZone),
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS,
      point: 'commercial_acceptance.decide',
      outcome: 'allowed',
      reason: outcome.replayed ? 'ACCEPTANCE_REPLAYED' : 'ACCEPTANCE_DECIDED',
      detail: {
        orderId: order.id,
        acceptanceId: outcome.acceptance.id,
        state: outcome.acceptance.state,
        basis: outcome.decision.basis,
        evidenceCount: outcome.decision.evidenceRefs.length,
      },
    });

    const detail = await this.repository.findDetailByOrder(order.id);
    if (!detail) {
      // Khong the xay ra: `append` vua ghi xong. Nem thay vi tra `null` de mot loi that khong bi
      // doc thanh "chua co ho so nao" o tang tren.
      throw TransportDomainError.notFound(
        'ACCEPTANCE_NOT_FOUND',
        `Khong doc lai duoc ho so ket thuc cua don ${order.code}`,
      );
    }
    return detail;
  }

  /**
   * HO SO cua MOT DON — kem CA lich su quyet dinh.
   *
   * `PENDING` duoc TRA VE chu khong phai `404` khi chua co quyet dinh nao: vang mat la mot cau tra
   * loi nghiep vu ("chua ai ket thuc"), khong phai mot loi. Tra `404` o day se buoc giao dien phai
   * doc mot ma loi de biet mot dieu binh thuong.
   */
  async detailForOrder(orderId: string): Promise<CommercialAcceptanceDetail> {
    const order = await this.requireOrder(orderId);
    const found = await this.repository.findDetailByOrder(order.id);
    if (found) return found;

    const at = this.now();
    return {
      acceptance: {
        id: '',
        orderId: order.id,
        state: 'PENDING',
        counterpartyId: null,
        businessDate: order.businessDate,
        latestDecisionId: null,
        openedBy: '',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
      decisions: [],
    };
  }

  /**
   * MOT DON CO DU DIEU KIEN DI VAO MOT KY DOI SOAT MOI KHONG — `#275` K5.
   *
   * ==========================================================================================
   * HAM NAY CHI DOC, VA DO LA DIEU QUAN TRONG NHAT VE NO
   * ==========================================================================================
   *
   * Cong doi soat GOI ham nay; no khong ghi mot dong nao va khong biet mot dong nao ve tien. Nho
   * vay chieu phu thuoc di MOT chieu (`transport-settlement` -> `transport-acceptance`) va tang ket
   * thuc khong bao gio cham duoc vao so tien.
   *
   * Phep suy that su nam o `isSettlementEligible()` — mot ham THUAN, kiem duoc khong can CSDL. O
   * day chi la phan tra cuu.
   */
  async eligibilityForOrder(orderId: string): Promise<OrderCompletionEligibility> {
    const order = await this.movement.findOrder(orderId);
    if (!order) return { kind: 'NO_ORDER' };
    return this.eligibilityOf(order);
  }

  /**
   * DIEU KIEN DOI SOAT cua mot CHUYEN v1 — tra loi qua DON cua no.
   *
   * ==========================================================================================
   * `NO_ORDER` DONG CONG. DO LA THAY DOI TRUNG TAM CUA `#275` SO VOI `#273`.
   * ==========================================================================================
   *
   * `#273` co mot nhanh `NOT_PROJECTED => pass`: mot chuyen chua duoc chieu sang mo hinh v2 thi
   * cong khong ap. Chu so huu da bac bo hinh dang do:
   *
   *     *"Remove/replace any final `NOT_PROJECTED => pass` behavior that allows a new Order to
   *     bypass the gate merely because it lacks a v2 Run projection. Order is the grain, so
   *     projection absence must not be an authorization bypass."*
   *
   * Nen o day vang mat cua don DONG cong. No van la mot NHANH RIENG chu khong gop vao `BLOCKED`,
   * vi viec nguoi truc phai lam khac han: chieu/tao nghia vu thuong mai cho chuyen do
   * (`POST /transport/orders/projections/trip/:tripId`), chu khong phai di xin chung tu.
   *
   * Duong tra cuu KHONG di qua vong chay — `movement.findOrderForTrip` doc `TransportTripOrderLink`
   * truc tiep. Do la ly do mot chuyen thue nha xe ngoai (khong bao gio co vong chay) van co chu the
   * de ket thuc.
   */
  async eligibilityForTrip(tripId: string): Promise<OrderCompletionEligibility> {
    const order = await this.movement.findOrderForTrip(tripId);
    if (!order) return { kind: 'NO_ORDER' };
    return this.eligibilityOf(order);
  }

  private async eligibilityOf(order: AcceptanceOrderFacts): Promise<OrderCompletionEligibility> {
    const acceptance = await this.repository.findByOrder(order.id);
    const state: CommercialAcceptanceState = acceptance?.state ?? 'PENDING';

    if (!isSettlementEligible({ orderStatus: order.status, state })) {
      return {
        kind: 'BLOCKED',
        orderId: order.id,
        orderCode: order.code,
        orderStatus: order.status,
        state,
      };
    }

    /*
     * `acceptance` KHONG the la `null` o nhanh nay: `isSettlementEligible` doi `state === 'APPROVED'`
     * va `PENDING` la gia tri duy nhat khi khong co hang. Nhung `??` van o day thay vi mot dau `!`:
     * mot khang dinh khong-null la mot loi hua voi trinh bien dich, con cai nay la mot gia tri doc
     * duoc neu loi hua do co ngay bi pha.
     */
    return {
      kind: 'ELIGIBLE',
      orderId: order.id,
      orderCode: order.code,
      acceptanceId: acceptance?.id ?? '',
    };
  }

  /**
   * HANG CHO nguoi quyet — `#275` K4.
   *
   * Doc MOT lan cho ca danh sach (`findManyByOrders`, `contextForOrders`) chu khong hoi tung don:
   * mot hang cho goi N+1 lan se cham dan theo dung toc do so don lon len, va do la thu khong ai
   * phat hien duoc luc demo.
   *
   * NGUON la `listCompletableOrders()` — nhung don DA GIAO XONG. Mot don chua giao xong khong nam
   * trong hang cho cua ke toan: chua co gi de ket thuc.
   *
   * SAP XEP: cho lau nhat len truoc (`businessDate` tang dan). Nguoi truc mo hang cho de tim viec
   * TON DONG, khong phai de xem viec vua xong.
   */
  async queue(
    filter: { readonly state?: CommercialAcceptanceState } = {},
  ): Promise<readonly CommercialAcceptanceQueueRow[]> {
    const orders = await this.movement.listCompletableOrders();
    const orderIds = orders.map((order) => order.id);
    const found = await this.repository.findManyByOrders(orderIds);
    const byOrder = new Map(found.map((entry) => [entry.orderId, entry]));
    const context = new Map(
      (await this.movement.contextForOrders(orderIds)).map((row) => [row.orderId, row]),
    );

    const rows = await Promise.all(
      orders.map(async (order): Promise<CommercialAcceptanceQueueRow> => {
        const acceptance = byOrder.get(order.id) ?? null;
        const state: CommercialAcceptanceState = acceptance?.state ?? 'PENDING';
        const operational = context.get(order.id) ?? null;
        return {
          acceptanceId: acceptance?.id ?? null,
          orderId: order.id,
          orderCode: order.code,
          orderStatus: order.status,
          customerId: order.customerId,
          originLabel: order.originLabel,
          destinationLabel: order.destinationLabel,
          state,
          counterpartyId: acceptance?.counterpartyId ?? null,
          businessDate: acceptance?.businessDate ?? order.businessDate,
          evidenceCount: await this.evidence.countFor(order.id),
          settlementEligible: isSettlementEligible({ orderStatus: order.status, state }),
          runCode: operational?.runCode ?? null,
          vehicleId: operational?.vehicleId ?? null,
          latestDecidedAt: acceptance?.updatedAt ?? null,
          latestDecidedBy: acceptance?.openedBy ?? null,
        };
      }),
    );

    const filtered = filter.state ? rows.filter((row) => row.state === filter.state) : rows;
    return [...filtered].sort((left, right) => left.businessDate.localeCompare(right.businessDate));
  }
}
