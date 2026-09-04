import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OrderView } from '@netviet/shared';
import { tenantSalesHandoffFollowup } from '@netviet/tenant';
import { AgentEventsService } from '../agents/agent-events.service.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { autoLabel } from '../channels/auto-label.js';
import { legacyReplyChannel } from '../channels/legacy-reply-channel.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import type { DecisionOutcome, DecisionPointOf } from '../observability/decision-vocabulary.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { pinnedOutboundVerdict } from '../outbound/outbound-authority.js';
import { TurnReplyService } from '../turns/turn-reply.service.js';
import { WorkflowHandoffService } from '../workflow/workflow-handoff.service.js';
import { SALES_HANDOFF_FOLLOWUP_KEY } from '../workflow/workflow-registry.js';
import { amendDecisionReason, canAmendOrder, type AmendVerdict } from './amend-window.js';
import {
  SALES_ORDER_DECISIONS,
  type FollowupScheduleReason,
  type ManualApproveReason,
  type ManualRejectReason,
  type SalesHandoffReason,
} from './sales-order-decisions.js';
import { OrdersRepository } from './orders.repository.js';

/**
 * Nguoi bam nut khi phien khong noi duoc ai — giu dung quy uoc `actor` san co cua audit
 * (`master-data.controller.ts`). KHONG bao gio de trong: mot ban ghi audit khong co actor tra
 * loi duoc "da xay ra gi" nhung khong tra loi duoc "ai chiu trach nhiem".
 */
const UNKNOWN_ACTOR = 'operator';

/** Kenh cua mot luot do NGUOI khoi dong — de loc tach khoi luot tin Zalo tu dong. */
const OPERATOR_CHANNEL = 'operator_console';

@Injectable()
export class OrdersService {
  private readonly confirmationsInFlight = new Map<string, Promise<OrderView>>();

  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly repo: OrdersRepository,
    private readonly outbound: OutboundChannelRouter,
    @Optional() private readonly events?: AgentEventsService,
    // Telemetry LUON `@Optional()` va fail-open: thieu quan sat thi don van phai chay.
    @Optional() private readonly telemetry?: TelemetryService,
    // `@Optional()` vi `AuditLogService` thuoc capability `operations`, con `OrdersService`
    // thuoc `sales-order` — mot khach khai `sales-order` ma khong khai `operations` la hop le
    // theo tenant contract v2, va no phai boot duoc.
    @Optional() private readonly audit?: AuditLogService,
    /**
     * Duong tra loi TRUNG TINH, do `turn-processing` so huu. `@Optional()` vi hang chuc bo test
     * dung `OrdersService` chi de kiem duong DON — chung khong can duong tu van, va bat chung
     * dung mot collaborator chung khong dung la mot cach lam ranh gioi trong nen giay.
     */
    @Optional() private readonly turnReply?: TurnReplyService,
    /**
     * CAU NOI DUY NHAT sang workflow engine — `@Optional()` va dat CUOI danh sach co chu y.
     *
     * `@Optional()` vi mot khach ban hang khong bat buoc phai chay workflow engine (mac dinh la
     * khong), va hang chuc bo test dung `OrdersService` truyen tham so THEO VI TRI. Vang mat =
     * khong dat lich theo doi; don van gui, van luu, van bao Sale y nhu truoc.
     */
    @Optional() private readonly workflows?: WorkflowHandoffService,
  ) {}

  /** Danh sach DON (intent dat_don). */
  async listOrders(): Promise<OrderView[]> {
    return (await this.repo.list()).filter((v) => v.intent === 'dat_don');
  }

  async getOrThrow(id: string): Promise<OrderView> {
    const view = await this.repo.findById(id);
    if (!view) throw new NotFoundException(`Khong tim thay don ${id}`);
    return view;
  }

  /**
   * Gui xac nhan cho khach, sau do ghi `sent` + handoff Sale trong cung mot repository update.
   * GĐ1 dung tai day: KHONG goi ERP. Neu outbound loi, don va handoff giu nguyen de gui lai.
   */
  async sendConfirmation(id: string): Promise<OrderView> {
    const inFlight = this.confirmationsInFlight.get(id);
    if (inFlight) return inFlight;

    const confirmation = this.performSendConfirmation(id).finally(() => {
      if (this.confirmationsInFlight.get(id) === confirmation) {
        this.confirmationsInFlight.delete(id);
      }
    });
    this.confirmationsInFlight.set(id, confirmation);
    return confirmation;
  }

  /**
   * Gui tu van san pham — UY QUYEN sang `TurnReplyService` (turn-processing).
   *
   * Giu lai o day mot cua duy nhat cho duong NGUOI BAM DUYET (`approve()` -> ROUTED_TO_ADVICE);
   * ban than viec gui khong con la nghiep vu ban hang nua.
   */
  async sendProductAdvice(id: string): Promise<OrderView> {
    if (!this.turnReply) {
      throw new ServiceUnavailableException(
        'Duong tra loi tu van chua duoc cau hinh (thieu capability turn-processing)',
      );
    }
    return this.turnReply.sendAdviceReply(id);
  }

  private async performSendConfirmation(id: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    // Ho tro ca du lieu legacy `synced`: khong gui lai mot don khach da nhan.
    if (view.status === 'sent' || view.status === 'synced') {
      return view;
    }
    if (!['pending_review', 'needs_edit', 'approved'].includes(view.status)) {
      throw new UnprocessableEntityException(
        `Đơn ở trạng thái ${view.status}, không thể gửi xác nhận`,
      );
    }
    if (!view.priced) {
      throw new UnprocessableEntityException('Tin nay khong phai don hang, khong the duyet');
    }

    try {
      await this.outbound.sendMessage(
        view.replyChannel ?? legacyReplyChannel(),
        view.chatId,
        view.priced.confirmationText + autoLabel(),
        'bot',
        { quote: view.quoteTarget },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Gửi xác nhận vào nhóm Zalo thất bại — đơn giữ nguyên, thử gửi lại. (${detail})`,
      );
    }

    const patch: Partial<OrderView> = {
      status: 'sent',
      salesHandoff: {
        action: 'manual_erp_entry',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    };

    /**
     * DAY LA DIEM SINH RA VIEC BAN GIAO — va cung la diem dat lich theo doi no.
     *
     * Hai lan ghi (don sang `sent` + hang outbox) di CUNG MOT GIAO DICH khi kho ho tro. Do la
     * ca ly do `updateWithin` ton tai: neu tien trinh chet giua hai lan ghi roi rac, ta se co
     * mot don da gui cho khach ma khong he thong nao nho phai theo doi no — dung tinh huong
     * khuon workflow nay sinh ra de xoa bo.
     *
     * KHONG goi Hatchet o day. `WorkflowHandoffService` chi ghi mot hang outbox roi tra ve
     * ngay; dispatcher rieng moi cham toi engine. Goi engine trong giao dich nghiep vu se cot
     * thoi gian chot don vao do san sang cua mot he thong khac.
     */
    const sent = await this.withFollowupScheduled(id, patch);
    this.events?.emit({ type: 'order.updated', order: sent });
    return sent;
  }

  /**
   * Ghi thay doi nghiep vu, va xep lich theo doi trong cung giao dich neu khach co bat.
   *
   * FAIL-CLOSED VE NGHIEP VU, FAIL-OPEN VE LICH: khach khong khai `handoffFollowup` (mac dinh)
   * thi khong co lich nao — don van gui binh thuong. Nguoc lai, mot loi khi xep hang KHONG bi
   * nuot: no cuon lai ca lan ghi don, vi mot don `sent` khong co nguoi theo doi la dung thu ta
   * dang tim cach loai bo.
   */
  private async withFollowupScheduled(id: string, patch: Partial<OrderView>): Promise<OrderView> {
    const policy = tenantSalesHandoffFollowup();
    const enabled = Boolean(policy?.enabled) && Boolean(this.workflows);

    if (!enabled) {
      this.decideSchedule('denied', policy?.enabled ? 'FOLLOWUP_NO_WORKFLOW_BINDING' : 'FOLLOWUP_DISABLED');
      return (await this.repo.update(id, patch))!;
    }

    const schedule = async (tx: unknown): Promise<void> => {
      const result = await this.workflows!.handoff(
        {
          workflowKey: SALES_HANDOFF_FOLLOWUP_KEY,
          operation: 'followup',
          // THAM CHIEU, khong phai anh chup: worker doc lai don tu DB o moi lan thuc day.
          entityType: 'sales-handoff',
          entityId: id,
        },
        tx,
      );
      // `skipped` = khach co policy nhung chua khai rang buoc workflow. Cau hinh HOP LE, khong
      // phai loi — nhung phai phan biet duoc voi "da xep hang" khi doc lai trace ve sau.
      this.decideSchedule(
        result.outcome === 'queued' ? 'allowed' : 'denied',
        result.outcome === 'queued' ? 'FOLLOWUP_SCHEDULED' : 'FOLLOWUP_NO_WORKFLOW_BINDING',
      );
    };

    // Kho khong ho tro giao dich (ban trong bo nho) -> lam tuan tu. Khong co cua so mat mat o
    // do: kho song trong chinh tien trinh nay, tien trinh chet la mat ca hai.
    if (!this.repo.updateWithin) {
      const updated = (await this.repo.update(id, patch))!;
      await schedule(undefined);
      return updated;
    }

    const { view } = await this.repo.updateWithin(id, patch, schedule);
    return view!;
  }

  private decideSchedule(outcome: DecisionOutcome, reason: FollowupScheduleReason): void {
    this.telemetry?.decision({
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'order.handoff_followup_schedule',
      outcome,
      reason,
    });
  }

  /** Sale dong tac vu nhap ERP thu cong; thao tac lap lai khong tao them handoff. */
  async completeSalesHandoff(id: string, actor: string = UNKNOWN_ACTOR): Promise<OrderView> {
    return this.operatorTurn(id, actor, 'order.complete_handoff', () =>
      this.completeSalesHandoffTurn(id, actor),
    );
  }

  /**
   * Moc `salesHandoff = completed` la BAT BIEN CHONG LECH ERP (§8.3): sau day LLM khong duoc
   * sua don nua. Mot chuyen trang thai khoa cung nhu vay phai co vet — ca trace lan so audit.
   */
  private async completeSalesHandoffTurn(id: string, actor: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    this.anchorToOrder(view);

    if (view.status !== 'sent' || !view.salesHandoff) {
      this.decide('order.sales_handoff', 'denied', 'NO_PENDING_HANDOFF', { status: view.status });
      await this.recordManualAction(
        actor,
        'order.sales_handoff.complete',
        view,
        view,
        'NO_PENDING_HANDOFF',
      );
      throw new UnprocessableEntityException('Đơn chưa có việc nhập ERP thủ công để hoàn tất');
    }
    if (view.salesHandoff.status === 'completed') {
      this.decide('order.sales_handoff', 'denied', 'HANDOFF_ALREADY_COMPLETED');
      await this.recordManualAction(
        actor,
        'order.sales_handoff.complete',
        view,
        view,
        'HANDOFF_ALREADY_COMPLETED',
      );
      return view;
    }

    const completed = (await this.repo.update(id, {
      salesHandoff: { ...view.salesHandoff, status: 'completed' },
    }))!;
    this.decide('order.sales_handoff', 'allowed', 'HANDOFF_COMPLETED');
    this.telemetry?.stateChange({
      entity: 'SalesHandoff',
      entityId: id,
      from: view.salesHandoff.status,
      to: 'completed',
      reason: 'HANDOFF_COMPLETED',
    });
    await this.recordManualAction(
      actor,
      'order.sales_handoff.complete',
      view,
      completed,
      'HANDOFF_COMPLETED',
    );
    this.events?.emit({ type: 'order.updated', order: completed });
    return completed;
  }

  /**
   * Nut "Duyet & gui" cua Sale — DINH TUYEN THEO NOI DUNG dang co.
   *
   * Truoc 21/08/2026 ham nay goi thang `sendConfirmation()`, ma ham do nem 422 "Tin nay khong
   * phai don hang" ngay khi `priced` rong. Console lai hien dung mot nut cho ca `pending_review`
   * lan `needs_edit`, nen MOI tin tu van deu bam vao mot loi — dung nhung tin ma cong handoff
   * tat dinh vua day ve `needs_edit`. Con `sendProductAdvice()` thi khong route nao goi toi.
   *
   * Thu tu xet co y: don da tinh gia di truoc, vi mot don vua co `priced` vua co `outbound` thi
   * ban XAC NHAN moi la chung tu — ban tu van chi la loi dan kem.
   */
  async approve(id: string, actor: string = UNKNOWN_ACTOR): Promise<OrderView> {
    return this.operatorTurn(id, actor, 'order.approve', () => this.approveTurn(id, actor));
  }

  private async approveTurn(id: string, actor: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    this.anchorToOrder(view);

    if (view.status === 'sent' || view.status === 'synced') {
      this.decide('order.manual_approve', 'denied', 'ALREADY_SENT', { status: view.status });
      await this.recordManualAction(actor, 'order.approve', view, view, 'ALREADY_SENT');
      return view;
    }

    // Thu tu xet giu nguyen: mot don vua co `priced` vua co `outbound` thi ban XAC NHAN moi la
    // chung tu — ban tu van chi la loi dan kem.
    const route: ManualApproveReason | null = view.priced
      ? 'ROUTED_TO_CONFIRMATION'
      : view.trace?.outbound
        ? 'ROUTED_TO_ADVICE'
        : null;

    if (!route) {
      this.decide('order.manual_approve', 'denied', 'NOTHING_TO_SEND', {
        status: view.status,
        intent: view.intent,
      });
      await this.recordManualAction(actor, 'order.approve', view, view, 'NOTHING_TO_SEND');
      throw new UnprocessableEntityException(
        'Tin nay chua co ban xac nhan hay ban tu van nao de gui',
      );
    }

    /*
     * NGUOI THAT BAM DUYET KHONG PHAI MOT NGUON THAM QUYEN.
     *
     * `TurnReplyService` van la diem nghen cuong che that (no chan ca duong tu dong), nhung o day
     * ta hoi TRUOC de tra ve mot ma dung: mot ban tu van bi tu choi vi thieu tham quyen la mot
     * quyet dinh CO CHU Y, khong phai mot lan gui hong. Gop hai thu lam mot se day Sale vao thoi
     * quen bam lai nut cho mot cong se khong bao gio mo.
     *
     * Muc 7 ca 7 hop dong: mot cu bam duyet khong duoc bien mot ban nhap LLM thanh mot cam ket
     * co tham quyen.
     */
    if (route === 'ROUTED_TO_ADVICE' && !pinnedOutboundVerdict(view.trace).sendable) {
      this.decide('order.manual_approve', 'denied', 'OUTBOUND_AUTHORITY_NOT_GRANTED', {
        reason: pinnedOutboundVerdict(view.trace).reason,
      });
      await this.recordManualAction(
        actor,
        'order.approve',
        view,
        view,
        'OUTBOUND_AUTHORITY_NOT_GRANTED',
      );
      throw new UnprocessableEntityException(
        'Bản tư vấn này chưa đủ thẩm quyền để gửi cho khách — cần soạn lại hoặc bổ sung dữ kiện có thẩm quyền.',
      );
    }

    this.decide('order.manual_approve', 'allowed', route);
    try {
      const sent =
        route === 'ROUTED_TO_CONFIRMATION'
          ? await this.sendConfirmation(id)
          : await this.sendProductAdvice(id);
      this.telemetry?.stateChange({
        entity: 'Order',
        entityId: id,
        from: view.status,
        to: sent.status,
        reason: route,
      });
      await this.recordManualAction(actor, 'order.approve', view, sent, route);
      return sent;
    } catch (error) {
      // `degraded`, khong phai `denied` — cong DA MO, that bai nam o duong gui. Cung phep phan
      // biet ma `order.auto_confirm` dung o duong tu dong (pipeline.service.ts).
      this.decide('order.manual_approve', 'degraded', 'SEND_FAILED', { route });
      await this.recordManualAction(actor, 'order.approve', view, view, 'SEND_FAILED');
      throw error;
    }
  }

  /**
   * HUY mot don — duong duy nhat de LLM (hoac Sale) dong mot don lai.
   *
   * Khac `reject()`: `reject` la Sale tu choi mot don CHUA gui. Ham nay di qua `canAmendOrder()`
   * nen no huy duoc ca don DA GUI, mien Sale chua go vao ERP — dung tinh huong khach bao "huy don
   * cu 20 lay 5 cai thoi" sau khi da nhan xac nhan.
   *
   * Dong luon viec nhap ERP: mot don da huy ma con nam trong hang viec cua Sale la cach chac chan
   * de no duoc go vao KiotViet sau do.
   */
  async cancelOrder(id: string, reason: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    this.anchorToOrder(view);
    if (view.status === 'rejected') {
      // Tra ve som, KHONG nem — nhung van la mot phan quyet cua cua so sua don, nen no phai de
      // lai dau vet y nhu cac duong khac.
      this.decideAmendWindow(canAmendOrder({ ...view, status: 'rejected' }));
      return view;
    }
    const verdict = canAmendOrder(view);
    this.decideAmendWindow(verdict);
    if (!verdict.allowed) throw new UnprocessableEntityException(verdict.message);

    const cancelled = (await this.repo.update(id, {
      status: 'rejected',
      cancelReason: reason,
      ...(view.salesHandoff
        ? { salesHandoff: { ...view.salesHandoff, status: 'cancelled' as const } }
        : {}),
    }))!;
    this.events?.emit({ type: 'order.updated', order: cancelled });
    return cancelled;
  }

  /** Noi hai don thay the nhau, sau khi don moi da duoc tao. */
  async linkSupersede(oldId: string, newId: string): Promise<void> {
    await this.repo.update(oldId, { supersededByOrderId: newId });
    await this.repo.update(newId, { supersedesOrderId: oldId });
  }

  /** Don con sua duoc khong — de ben goi hoi TRUOC khi hua voi khach. */
  async amendVerdict(id: string): Promise<AmendVerdict> {
    return canAmendOrder(await this.getOrThrow(id));
  }

  async reject(id: string, actor: string = UNKNOWN_ACTOR): Promise<OrderView> {
    return this.operatorTurn(id, actor, 'order.reject', () => this.rejectTurn(id, actor));
  }

  private async rejectTurn(id: string, actor: string): Promise<OrderView> {
    const view = await this.getOrThrow(id);
    this.anchorToOrder(view);

    if (view.status === 'rejected') {
      this.decide('order.manual_reject', 'denied', 'ALREADY_REJECTED');
      await this.recordManualAction(actor, 'order.reject', view, view, 'ALREADY_REJECTED');
      return view;
    }
    if (!['draft', 'pending_review', 'needs_edit', 'approved'].includes(view.status)) {
      this.decide('order.manual_reject', 'denied', 'STATUS_NOT_REJECTABLE', {
        status: view.status,
      });
      await this.recordManualAction(actor, 'order.reject', view, view, 'STATUS_NOT_REJECTABLE');
      throw new UnprocessableEntityException(`Đơn ở trạng thái ${view.status}, không thể từ chối`);
    }

    const rejected = (await this.repo.update(id, { status: 'rejected' }))!;
    this.decide('order.manual_reject', 'allowed', 'REJECTED');
    this.telemetry?.stateChange({
      entity: 'Order',
      entityId: id,
      from: view.status,
      to: rejected.status,
      reason: 'REJECTED',
    });
    this.events?.emit({ type: 'order.updated', order: rejected });
    await this.recordManualAction(actor, 'order.reject', view, rejected, 'REJECTED');
    return rejected;
  }

  /* ---------------------------------------------------------------- *
   * Ha tang quan sat cho BA CONG NGUOI BAM NUT.
   *
   * SU CO 22/08/2026: trace `b44d631c` ket thuc bang `advice.auto_reply -> denied
   * KILL_SWITCH_OFF`, roi 3,8 giay sau cau tra loi VAN ra nhom that qua nut "Duyet & gui" — va
   * khong co MOT DONG NAO trong log lan audit. Doc trace luot do se ket luan "he thong khong gui
   * gi", tuc la mot cai NHAN SAI — con te hon khong co nhan.
   * ---------------------------------------------------------------- */

  /**
   * Mo mot LUOT MOI cho hanh dong cua nguoi van hanh, roi chay no nhu mot buoc nghiep vu.
   *
   * `traceId` MOI chu khong dung lai cua tin goc — ly do day du o `TraceAnchors.causationTraceId`.
   * Da o trong mot trace san thi khong mo them: mot luot long trong luot khac se cat cay trace
   * thanh hai cay roi, dung bay ma `PipelineService.process()` da tranh.
   */
  private operatorTurn<T>(
    id: string,
    actor: string,
    step: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.telemetry) return fn();
    const telemetry = this.telemetry;
    const run = (): Promise<T> => telemetry.step(step, fn, { actor });
    if (telemetry.traceId()) return run();
    return telemetry.runTurn({ orderId: id, channel: OPERATOR_CHANNEL, actor }, run);
  }

  /** Noi luot cua nguoi voi don VA voi luot tin da sinh ra don do. */
  private anchorToOrder(view: OrderView): void {
    this.telemetry?.enrich({
      chatId: view.chatId,
      intent: view.intent,
      ...(view.traceId ? { causationTraceId: view.traceId } : {}),
    });
  }

  /**
   * Ghi phan quyet cua CUA SO SUA DON.
   *
   * Tach khoi `decide()` vi bo ma khac han: day la cong cua KHACH xin doi don, con `decide()`
   * phuc vu ba cong NGUOI BAM NUT. `outcome` doc thang tu phan quyet — khong co duong nao ghi
   * `allowed` cho mot lan tu choi.
   */
  private decideAmendWindow(verdict: AmendVerdict): void {
    this.telemetry?.decision({
      vocabulary: SALES_ORDER_DECISIONS,
      point: 'order.amend_window',
      outcome: verdict.allowed ? 'allowed' : 'denied',
      reason: amendDecisionReason(verdict),
    });
  }

  private decide(
    point: DecisionPointOf<typeof SALES_ORDER_DECISIONS>,
    outcome: DecisionOutcome,
    reason: ManualApproveReason | ManualRejectReason | SalesHandoffReason,
    detail?: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: SALES_ORDER_DECISIONS,
      point,
      outcome,
      reason,
      ...(detail ? { detail } : {}),
    });
  }

  /**
   * Ghi so audit cho mot thao tac cua nguoi.
   *
   * LOI GHI SO KHONG DUOC LAM HONG MOT LAN GUI DA THANH CONG — cung ly do da viet o
   * `patchConversation()`: ham nay chay SAU khi tin da ra khoi he thong, nen nem loi o day chi
   * doi mot thanh cong lay mot 500, roi moi Sale bam lai lan nua.
   *
   * NHUNG "fail-open" khong duoc dong nghia voi "im lang": mot thao tac co the gui tin that cho
   * khach (hoac vuot moc khoa ERP §8.3) trong khi dong `AuditLog` khong ghi duoc. Nen lan ghi
   * duoc boc trong mot BUOC — that bai thanh `event=step status=error step=audit.persist`, loc
   * duoc va bao dong duoc, thay vi mot dong chu tu do chi tim ra bang grep. Hau to `.persist`
   * lam `buildTraceView` tu xep no vao nhom ky thuat, nen Sale khong thay them nhieu.
   */
  private async recordManualAction(
    actor: string,
    action: string,
    before: OrderView,
    after: OrderView,
    reason: string,
  ): Promise<void> {
    if (!this.audit) return;
    const audit = this.audit;
    const traceId = this.telemetry?.traceId();
    const write = (): Promise<unknown> =>
      audit.append({
        actor,
        action,
        entityType: 'Order',
        entityId: after.id,
        before: { status: before.status, salesHandoff: before.salesHandoff ?? null },
        after: {
          status: after.status,
          salesHandoff: after.salesHandoff ?? null,
          reason,
          // Soi day noi SO AUDIT voi TRACE: audit tra loi "ai, luc nao"; trace tra loi "vi sao".
          ...(traceId ? { traceId } : {}),
        },
      });
    try {
      await (this.telemetry ? this.telemetry.step('audit.persist', write, { action }) : write());
    } catch (error) {
      this.logger.error(
        `Khong ghi duoc audit ${action} cho don ${after.id}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
