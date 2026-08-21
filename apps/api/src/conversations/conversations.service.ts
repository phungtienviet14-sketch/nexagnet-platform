import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  ChannelMessage,
  ConversationThread,
  ConversationThreadView,
  OrderDraft,
  OrderView,
} from '@netviet/shared';
import { autoLabel } from '../channels/auto-label.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { buildClarifyQuestion } from './clarify-question.js';
import {
  DEFAULT_THREAD_POLICY,
  canAskAgain,
  isAwaiting,
  isLive,
  reduceThread,
  type ThreadKey,
  type ThreadPolicy,
} from './conversation-thread.js';
import { ConversationThreadsRepository } from './conversation-threads.repository.js';
import { draftHasContent } from './order-draft.js';

/**
 * Dieu phoi MACH HOI THOAI: giu don nhap cua tung khach, quyet dinh HOI LAI hay CHUYEN SALE, va
 * gui cau hoi vao dung nhom, trich dan dung tin.
 *
 * Ranh gioi trach nhiem:
 *   - `order-draft.ts` / `conversation-thread.ts` = quyet dinh THUAN (thieu gi, con hoi duoc khong).
 *   - Lop nay = tac dung phu (doc/ghi kho, gui tin) va DUY NHAT no duoc phep gui.
 *   - `PipelineService` goi lop nay; no khong tu doc tin nhan den.
 *
 * FAIL-SAFE xuyen suot: moi loi o day chi log. Mot cau hoi lai khong gui duoc thi don van nam
 * cho Sale nhu truoc Pha 6 — te hon mot chut, khong mat gi.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('Conversations');
  private readonly policy: ThreadPolicy;

  constructor(
    private readonly threads: ConversationThreadsRepository,
    private readonly knowledge: KnowledgeService,
    @Optional() private readonly outbound?: OutboundChannelRouter,
    @Optional() policy?: ThreadPolicy,
  ) {
    this.policy = policy ?? DEFAULT_THREAD_POLICY;
  }

  /** Khoa mach cua mot tin. `null` khi kenh khong cap uid nguoi gui — luc do khong co mach. */
  static keyOf(message: ChannelMessage): ThreadKey | null {
    return message.senderExternalId
      ? { chatId: message.externalChatId, senderExternalId: message.senderExternalId }
      : null;
  }

  /** Don nhap dang do cua khach nay, hoac `null` neu mach da dong/het han. */
  async pendingDraft(key: ThreadKey, now: Date): Promise<OrderDraft | null> {
    const thread = await this.threads.find(key);
    return isLive(thread, now) ? thread.draft : null;
  }

  /** Tin ke tiep cua khach co dang la CAU TRA LOI cho cau bot vua hoi khong. */
  async isAnsweringQuestion(key: ThreadKey, now: Date): Promise<boolean> {
    return isAwaiting(await this.threads.find(key), now);
  }

  /**
   * Ket thuc mot luot xu ly tin: cap nhat mach, va hoi lai khach neu con thieu du kien HOI DUOC.
   *
   * Tra ve trang thai mach de dinh kem `OrderView` — console cua Sale phai nhin duoc "dang cho
   * ai tra loi gi", neu khong thi mot don dung yen se trong y het mot don bi bo quen.
   */
  async settle(input: SettleInput): Promise<ConversationThreadView | undefined> {
    const { key, message, view, now } = input;
    try {
      const current = await this.threads.find(key);
      const draft = view.pendingDraft;
      // Tin khong mang du kien don hang (chao hoi, hoi cong nang) khong duoc dong mach dang mo:
      // khach hoi xen mot cau roi quay lai tra loi la chuyen binh thuong trong nhom Zalo.
      if (!draft || !draftHasContent(draft)) return toView(current, now);

      const withMessage = reduceThread(
        current,
        {
          type: 'customer_message',
          draft,
          ...(message.senderDisplayName ? { displayName: message.senderDisplayName } : {}),
        },
        key,
        now,
        this.policy,
      );

      if (input.closed) {
        const closed = reduceThread(withMessage, { type: 'closed', orderId: view.id }, key, now, this.policy);
        await this.threads.save(closed);
        return toView(closed, now);
      }

      const askable = view.draftGaps?.askable ?? [];
      const settled = askable.length
        ? await this.askOrHandOff(withMessage, input)
        : reduceThread(withMessage, { type: 'handed_off', orderId: view.id }, key, now, this.policy);
      await this.threads.save(settled);
      return toView(settled, now);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cap nhat mach hoi thoai that bai (don van giu nguyen): ${detail}`);
      return undefined;
    }
  }

  private async askOrHandOff(
    thread: ConversationThread,
    input: SettleInput,
  ): Promise<ConversationThread> {
    const { key, view, now } = input;
    if (!canAskAgain(thread, this.policy)) {
      this.logger.log(
        `Het ${this.policy.maxQuestions} luot hoi voi ${key.senderExternalId} — chuyen Sale.`,
      );
      return reduceThread(thread, { type: 'handed_off', orderId: view.id }, key, now, this.policy);
    }
    if (input.muted) {
      // Giu `collecting`: don nhap van song de Sale nhin thay va de tin sau con ghep tiep, chi
      // khong co cau hoi nao duoc gui.
      return thread;
    }
    const askable = view.draftGaps?.askable ?? [];
    // Cau do LLM soan (neu co) uu tien hon ban mau; ban mau la luoi an toan, khong phai lua chon
    // thu hai ve chat luong — no chi khong biet noi mem.
    const question =
      input.composedQuestion?.trim() ||
      buildClarifyQuestion(askable, {
        draft: thread.draft,
        products: this.knowledge.products(),
        ...(thread.senderDisplayName ? { displayName: thread.senderDisplayName } : {}),
      });
    if (!question) {
      return reduceThread(thread, { type: 'handed_off', orderId: view.id }, key, now, this.policy);
    }
    const sent = await this.send(input, question);
    return sent
      ? reduceThread(thread, { type: 'asked', slots: askable, question }, key, now, this.policy)
      : reduceThread(thread, { type: 'handed_off', orderId: view.id }, key, now, this.policy);
  }

  /**
   * Gui cau hoi vao nhom, TRICH DAN tin cua chinh khach do. Trich dan la thu duy nhat lam mot cau
   * hoi trong nhom 200 nguoi tro nen co dia chi; khong co no thi hai khach dang hoi cung luc se
   * cung tuong cau hoi la danh cho minh.
   */
  private async send(input: SettleInput, question: string): Promise<boolean> {
    const channel = input.view.replyChannel;
    if (!this.outbound || !channel) {
      this.logger.warn('Khong co kenh tra loi — khong gui duoc cau hoi lai, chuyen Sale.');
      return false;
    }
    // `OutboundChannelRouter` la chot chan DUY NHAT luu tin da gui (Pha 1) — no tu goi
    // `OutboundRecorder`, nen o day KHONG duoc ghi them lan nua, neu khong lich su hoi thoai se
    // co hai ban cua cung mot cau hoi va LLM doc thay minh da hoi hai lan.
    const text = question + autoLabel();
    try {
      await this.outbound.sendMessage(channel, input.view.chatId, text, 'bot', {
        ...(input.view.quoteTarget ? { quote: input.view.quoteTarget } : {}),
      });
      return true;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Gui cau hoi lai that bai — chuyen Sale: ${detail}`);
      return false;
    }
  }
}

export interface SettleInput {
  readonly key: ThreadKey;
  readonly message: ChannelMessage;
  readonly view: OrderView;
  readonly now: Date;
  /** Don da chot va da gui xac nhan trong luot nay. */
  readonly closed: boolean;
  /** Cau hoi do agent tu van soan; rong thi dung ban mau tat dinh. */
  readonly composedQuestion?: string;
  /**
   * Cap nhat mach nhung KHONG gui gi vao nhom. Bat khi kill switch `AUTO_SEND=off` hoac thanh
   * vien dang `manual_review`: mot cau hoi tu dong cung la mot tin tu dong: no phai chiu dung
   * cong tat/mo voi ban xac nhan, khong duoc di vong qua.
   */
  readonly muted?: boolean;
}

function toView(
  thread: ConversationThread | null,
  now: Date,
): ConversationThreadView | undefined {
  if (!thread) return undefined;
  // Mach da ket thuc thi giu nguyen ket cuc that cua no. Chi mach CON DANG MO ma da het han moi
  // duoc ha xuong `handed_off` — Sale khong can nhin mot cau hoi khong con ai cho tra loi nua.
  const terminal = thread.status === 'closed' || thread.status === 'handed_off';
  const status = terminal || isLive(thread, now) ? thread.status : 'handed_off';
  return {
    status,
    awaitingSlots: status === 'awaiting_answer' ? thread.awaitingSlots : [],
    askCount: thread.askCount,
    ...(thread.lastQuestion ? { question: thread.lastQuestion } : {}),
  };
}
