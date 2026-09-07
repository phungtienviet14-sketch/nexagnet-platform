import { backoffDelayMs } from './backoff.js';
import {
  DEFAULT_OUTBOX_POLICY,
  type EnqueueCommand,
  type OutboxItem,
  type OutboxItemKind,
  type OutboxPolicy,
  type OutboxStore,
  type SendOutcome,
  type SyncStatus,
} from './outbox.types.js';

/**
 * NGUOI GUI — do ung dung cung cap, vi chi ung dung biet cach noi chuyen voi mang.
 *
 * Chu y chu ky: `sendBatch` nhan MOT LO va tra ve ket cuc CHO TUNG MUC, khong phai mot ket cuc
 * chung. Day khong phai su ky tinh: duong ingest ban dinh vi cua may chu tra ve mot MANG cung do
 * dai voi dau vao chinh de may khach doi chieu duoc tung cai. Neu ep mot lo thanh mot `boolean`,
 * mot lo 200 ban co mot ban sai hinh dang se hoac lam mat 199 ban dung, hoac giu lai ca 200 va
 * quay vong mai mai vi mot ban.
 */
export interface OutboxSender {
  sendBatch(items: readonly OutboxItem[]): Promise<readonly SendOutcome[]>;
}

export interface OutboxDeps {
  readonly store: OutboxStore;
  readonly sender: OutboxSender;
  /** Dong ho tiem vao — de test khong phai cho that va de lan gui lai dung mot moc xac dinh. */
  readonly now: () => Date;
  /** Sinh khoa dong cuc bo. Tach ra vi React Native khong co `node:crypto`. */
  readonly newId: () => string;
  readonly policy?: OutboxPolicy;
}

/**
 * DONG CO HANG DOI NGOAI TUYEN.
 *
 * ============================================================================================
 * BON DIEU LOP NAY BAO DAM, VA MOI DIEU DEU CO MOT CACH HONG CU THE NEU THIEU
 * ============================================================================================
 *
 * 1. `capturedAt` DONG BANG luc bam. Thieu -> mot ban dinh vi ghi luc 14:00 gui duoc luc 18:00 se
 *    den may chu mang nhan 18:00, va moi phep do quang duong/toc do/lien tuc ben do tinh tren mot
 *    duong di khong ton tai. No khong bao loi; no im lang tinh sai.
 *
 * 2. `clientEventId` sinh MOT LAN va giu nguyen qua moi lan gui lai. Thieu -> may chu, dung theo
 *    hop dong cua no, coi moi lan thu lai la mot su kien MOI va ghi them mot hang.
 *
 * 3. Muc bi tu choi VINH VIEN duoc dat sang mot ben thay vi thu lai. Thieu -> mot yeu cau sai hinh
 *    dang chan ca hang doi phia sau, va mot ngay lam viec khong co gi len duoc may chu vi mot ban
 *    ghi hong tu sang som.
 *
 * 4. Lo bi CHAN TREN o `maxBatchSize`. Thieu -> sau bon tieng mat song, lan noi lai dau tien se
 *    la mot yeu cau vai nghin phan tu, va may chu tu choi ca lo do vuot `.max(200)`.
 *
 * KHONG co hen gio o day. `drain()` la mot phep goi; viec goi no khi nao (khi mang co lai, khi
 * ung dung mo, theo mot chu ky nen) la viec cua ung dung — noi biet cac API vong doi cua he dieu
 * hanh ma goi nay CO Y khong biet.
 */
export class OutboxEngine {
  private readonly policy: OutboxPolicy;
  private lastAttemptAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly deps: OutboxDeps) {
    this.policy = deps.policy ?? DEFAULT_OUTBOX_POLICY;
  }

  /**
   * Xep mot viec vao hang. Tra ve muc DANG NAM trong hang — co the la muc cu neu trung khoa.
   *
   * `capturedAt` den TU NGUOI GOI, khong phai tu `now()`: viec bam va viec xep hang la hai thoi
   * diem khac nhau, va cai co nghia la cai thu nhat.
   */
  async enqueue(command: EnqueueCommand): Promise<OutboxItem> {
    const item: OutboxItem = {
      id: this.deps.newId(),
      clientEventId: command.clientEventId,
      kind: command.kind,
      capturedAt: command.capturedAt,
      payload: command.payload,
      attachments: command.attachments ?? [],
      attempts: 0,
      // Gui duoc NGAY: mot muc moi khong co ly do gi phai cho.
      nextAttemptAt: this.deps.now().toISOString(),
      state: 'PENDING',
      lastError: null,
    };
    return this.deps.store.append(item);
  }

  /**
   * Gui mot lo cua MOT loai. Tra ve so muc da duoc may chu nhan.
   *
   * Mot loai moi lan chu khong tron: ban dinh vi di thanh lo JSON, chung cu di kem tep. Tron
   * chung se buoc `sendBatch` phai tu phan loai lai — tuc dat mot canh `if` vao dung cho ma nguoi
   * ta se quen no.
   */
  async drain(kind: OutboxItemKind): Promise<number> {
    const now = this.deps.now();
    const batch = await this.deps.store.claim(kind, this.policy.maxBatchSize, now);
    if (batch.length === 0) return 0;

    this.lastAttemptAt = now.toISOString();

    let outcomes: readonly SendOutcome[];
    try {
      outcomes = await this.deps.sender.sendBatch(batch);
    } catch (error) {
      // Mot lan nem tu `sendBatch` la mot loi MANG, khong phai mot phan quyet cua may chu — nen ca
      // lo duoc lui lich, khong muc nao bi chan. Doan nay la ly do ung dung khong phai tu bat loi.
      const reason = messageOf(error);
      this.lastError = reason;
      for (const item of batch) await this.retryLater(item, reason);
      return 0;
    }

    const accepted: string[] = [];
    let lastFailure: string | null = null;

    for (const [index, item] of batch.entries()) {
      // `outcomes` ngan hon `batch` la mot may chu sai hop dong. Coi phan thieu la THU LAI: gia su
      // "da nhan" se lam mat bang chung vinh vien, va do la huong sai duy nhat khong sua duoc.
      const outcome = outcomes[index] ?? { kind: 'RETRY' as const, reason: 'MISSING_OUTCOME' };

      if (outcome.kind === 'ACCEPTED') {
        accepted.push(item.id);
        continue;
      }
      if (outcome.kind === 'REJECTED') {
        lastFailure = outcome.reason;
        await this.deps.store.block(item.id, outcome.reason);
        continue;
      }
      lastFailure = outcome.reason;
      await this.retryLater(item, outcome.reason);
    }

    if (accepted.length > 0) await this.deps.store.remove(accepted);
    this.lastError = lastFailure;
    return accepted.length;
  }

  async status(): Promise<SyncStatus> {
    const counts = await this.deps.store.countByState();
    return {
      pending: counts.pending,
      blocked: counts.blocked,
      lastAttemptAt: this.lastAttemptAt,
      lastError: this.lastError,
    };
  }

  /** Muc KHONG gui duoc — giao dien phai bay duoc chung ra, khong duoc giau. */
  blocked(): Promise<readonly OutboxItem[]> {
    return this.deps.store.listBlocked();
  }

  private async retryLater(item: OutboxItem, reason: string): Promise<void> {
    // `attempts + 1` vi cach cho phai tinh tren lan vua that bai, khong tren so lan truoc do.
    const delay = backoffDelayMs(item.attempts + 1, this.policy);
    const next = new Date(this.deps.now().getTime() + delay);
    await this.deps.store.reschedule(item.id, next, reason);
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return 'NETWORK_ERROR';
}
