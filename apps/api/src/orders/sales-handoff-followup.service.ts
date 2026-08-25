import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { AuditLogService } from '../audit/audit-log.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { OrdersRepository } from './orders.repository.js';
import { SALES_ORDER_DECISIONS, type FollowupMarkReason } from './sales-order-decisions.js';

/**
 * CONG EXACTLY-ONCE cua workflow `sales-handoff-followup`, va NGUON SU THAT cua no.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LOP NAY NAM O `orders/` CHU KHONG O `workflow/`:
 *
 * "Mot viec ban giao con treo hay khong" la mot cau hoi NGHIEP VU BAN HANG. Engine khong duoc
 * tra loi no — engine chi biet "da toi luc di hoi". Neu trang thai nay song ben Hatchet thi
 * Hatchet tro thanh mot co so du lieu nghiep vu thu hai, va hai nguon su that ve cung mot viec
 * la cach chac chan nhat de mot trong hai noi doi.
 *
 * Cu the: con nguoi bam "da nhap ERP" tren console trong luc workflow dang ngu. DB nghiep vu
 * doi ngay lap tuc; ban chup ma workflow mang theo thi khong. Nen ban chup do KHONG duoc phep
 * la can cu — moi lan thuc day phai hoi lai lop nay.
 *
 * ---------------------------------------------------------------------------
 * HAI LOP CHONG TRUNG, va can ca hai:
 *
 *   1. `idempotency-key` cua worker — chan lan chay LAP LAI cua cung mot task Hatchet.
 *   2. `markFollowup()` o day — CONG TRANG THAI: chi ghi khi con `pending`, va khong bao gio
 *      ghi de mot giai doan da co. Chan thu ma lop 1 khong the thay: hai lan goi den tu hai
 *      duong khac nhau (vi du mot su kien bi xep hang hai lan voi hai khoa khac nhau).
 *
 * Lop 2 la lop KHONG THE BO. No khong tin vao khoa, khong tin vao engine, chi tin vao trang
 * thai hien tai cua chinh don hang.
 */
@Injectable()
export class SalesHandoffFollowupService {
  private readonly logger = new Logger(SalesHandoffFollowupService.name);

  constructor(
    private readonly repo: OrdersRepository,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  /**
   * Trang thai SONG cua viec ban giao — cai ma workflow doc lai o moi lan thuc day.
   *
   * `null` = khong tim thay don. Noi goi (controller) doi no thanh 404, va worker coi 404 la
   * "het viec" chu khong phai loi: mot don khong con ton tai la mot cau tra loi hop le cho cau
   * "viec nay con treo khong?".
   */
  async readState(orderId: string): Promise<HandoffStateView | null> {
    const view = await this.repo.findById(orderId);
    if (!view) return null;
    return describeHandoff(view);
  }

  /**
   * DANH DAU "qua han, can nguoi de y" — tac dung phu duy nhat cua khuon workflow nay.
   *
   * KHONG day ERP va KHONG gui tin ra ngoai. Pham vi cua v1 la lam cho mot viec dang treo
   * NHIN THAY DUOC, khong phai lam thay phan viec cua con nguoi.
   *
   * `applied: false` KHONG phai loi — no la cau tra loi dung trong hai truong hop rat binh
   * thuong: nguoi da xu ly xong trong luc cho, hoac giai doan nay da duoc danh dau roi.
   */
  async markFollowup(orderId: string, stage: string): Promise<FollowupMarkResult | null> {
    const view = await this.repo.findById(orderId);
    if (!view) return null;

    const current = describeHandoff(view);

    // CONG 1 — con treo khong? Doc trang thai HIEN TAI, khong phai trang thai luc xep hang.
    if (current.state !== 'pending') {
      return this.decided(view, stage, false, 'FOLLOWUP_NOT_PENDING');
    }

    // CONG 2 — da danh dau giai doan nay chua? Chan chay lai va su kien trung.
    if (current.followUpStage === stage) {
      return this.decided(view, stage, false, 'FOLLOWUP_ALREADY_MARKED');
    }

    const at = new Date().toISOString();
    const updated = await this.repo.update(orderId, {
      // `salesHandoff` chac chan ton tai: `state === 'pending'` chi dung duoc khi no co.
      salesHandoff: { ...view.salesHandoff!, followUp: { stage, at } },
    });
    if (!updated) return null;

    this.logger.log(`[FOLLOWUP] don ${orderId} qua han — danh dau giai doan '${stage}'`);
    return this.decided(updated, stage, true, 'FOLLOWUP_MARKED');
  }

  /**
   * Ghi quyet dinh + audit roi tra ket qua. TOAN BO phan quan sat nam trong `try` va nuot loi:
   * quan sat hong khong duoc lam hong nghiep vu (bat bien so mot cua `TelemetryService`).
   */
  private decided(
    view: OrderView,
    stage: string,
    applied: boolean,
    reason: FollowupMarkReason,
  ): FollowupMarkResult {
    try {
      this.telemetry?.decision({
        vocabulary: SALES_ORDER_DECISIONS,
        point: 'order.handoff_followup_mark',
        outcome: applied ? 'allowed' : 'denied',
        reason,
        // CHI co nhan, khong co noi dung don: cau hoi o day la "he thong da quyet dinh gi".
        detail: { stage },
      });
      if (applied) {
        void this.audit?.append({
          actor: 'system',
          action: 'order.sales_handoff.followup',
          entityType: 'Order',
          entityId: view.id,
          after: { stage, reason },
          requestId: null,
        });
      }
    } catch {
      /* fail-open */
    }
    return { applied, stage, reason };
  }
}

export interface FollowupMarkResult {
  readonly applied: boolean;
  readonly stage: string;
  readonly reason: FollowupMarkReason;
}

/**
 * Hop dong DAY ra ngoai cho worker. Union phan biet, khong phai mot `status: string`: ba truong
 * hop dan toi ba hanh dong khac han nhau o phia worker.
 */
export type HandoffStateView =
  | { readonly state: 'pending'; readonly openedAt: string; readonly followUpStage: string | null }
  | { readonly state: 'resolved'; readonly resolution: string }
  | { readonly state: 'absent' };

/**
 * `OrderView` -> trang thai viec ban giao.
 *
 * MOC CHAN LA `salesHandoff`, KHONG PHAI `status` — cung ly do voi `canAmendOrder()`: `sent`
 * khong dong nghia "con phai lam gi do", va `salesHandoff` moi la cho ghi viec do.
 */
export function describeHandoff(view: OrderView): HandoffStateView {
  const handoff = view.salesHandoff;
  if (!handoff) return { state: 'absent' };
  if (handoff.status !== 'pending') return { state: 'resolved', resolution: handoff.status };
  // Mot don da roi khoi `sent` (bi huy, bi thay the) thi viec nhap ERP cua no khong con y nghia
  // du `salesHandoff` chua kip doi — doc `status` o day la lop chan thu hai, khong phai thua.
  if (view.status !== 'sent') return { state: 'resolved', resolution: view.status };
  return {
    state: 'pending',
    openedAt: handoff.createdAt,
    followUpStage: handoff.followUp?.stage ?? null,
  };
}
