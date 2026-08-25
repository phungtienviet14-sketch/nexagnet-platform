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
 * CHONG TRUNG: MOT LOP QUYET DINH, khong phai hai.
 *
 * Ban dau tep nay tuyen bo "hai lop, can ca hai" va ke `idempotency-key` la lop thu nhat. NOI
 * NHU VAY LA SAI, va soat lai da bat duoc: may chu KHONG luu, khong tieu thu va khong doi soat
 * khoa do — no chi di theo yeu cau roi vao log/trace. Mot khoa khong ai doc thi khong chan duoc
 * gi ca.
 *
 * Su that dung mot cau: **`compareAndSet` o `markFollowup()` la lop quyet dinh DUY NHAT.**
 * No khoa hang (`FOR UPDATE`) roi doc-quyet dinh-ghi trong CUNG mot giao dich, nen no chan duoc
 * ca ba nguon trung: task chay lai, su kien xep hang hai lan, va hai yeu cau chong nhau. No
 * khong tin vao khoa, khong tin vao engine — chi tin trang thai hien tai cua chinh don hang.
 *
 * `Idempotency-Key` van duoc worker gui, va no van co ich — nhung dung voi vai tro CUA NO:
 * mot neo doi soat trong log/trace ("lan goi nay thuoc thao tac nao"), khong phai mot cong.
 * Xem `sales-handoff.controller.ts`.
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
    const at = new Date().toISOString();

    /*
     * MOT LAN DI DB, NGUYEN TU. Truoc day day la `findById()` -> kiem -> `update()`, tuc mot
     * `check-then-act` co cua so: hai yeu cau chong nhau cung doc "chua nhac" roi CA HAI cung
     * ghi. Do duoc that tren Postgres — 5 lan goi song song ra 5 lan danh dau va 5 ban ghi audit
     * (`sales-handoff-concurrency.int.spec.ts`).
     *
     * `decide` DONG BO va thuan co y: mot `await` o day se mo lai dung cua so vua dong.
     */
    const outcome = await this.repo.compareAndSet?.(orderId, (current) => {
      const state = describeHandoff(current);

      // CONG 1 — con treo khong? Doc trang thai HIEN TAI (da khoa hang), khong phai ban chup
      // luc xep hang.
      if (state.state !== 'pending') {
        return { commit: false, result: 'FOLLOWUP_NOT_PENDING' as FollowupMarkReason };
      }
      // CONG 2 — giai doan nay da duoc danh dau chua? Chan chay lai va su kien trung.
      if (state.followUpStage === stage) {
        return { commit: false, result: 'FOLLOWUP_ALREADY_MARKED' as FollowupMarkReason };
      }
      return {
        commit: true,
        // `salesHandoff` chac chan ton tai: `state === 'pending'` chi dung duoc khi no co.
        patch: { salesHandoff: { ...current.salesHandoff!, followUp: { stage, at } } },
        result: 'FOLLOWUP_MARKED' as FollowupMarkReason,
      };
    });

    if (outcome === undefined) {
      // Kho khong hien thuc cong nguyen tu. KHONG lui ve duong `check-then-act` cu: lam vay la
      // im lang tra lai dung lo hong vua vá. Ca hai kho that (Postgres + bo nho) deu co no.
      throw new Error(
        'SALES_HANDOFF_CAS_UNSUPPORTED: kho luot khong ho tro compareAndSet — khong the bao dam ' +
          'danh dau dung mot lan.',
      );
    }
    if (outcome === null) return null;

    const reason = outcome.result;
    if (reason === 'FOLLOWUP_MARKED') {
      this.logger.log(`[FOLLOWUP] don ${orderId} qua han — danh dau giai doan '${stage}'`);
    }
    return this.decided(outcome.view, stage, reason === 'FOLLOWUP_MARKED', reason);
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
