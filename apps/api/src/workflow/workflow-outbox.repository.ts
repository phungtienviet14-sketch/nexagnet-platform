/**
 * OUTBOX GIAO DICH — ban giao DANG TIN CAY tu DB nghiep vu sang workflow engine.
 *
 * VAN DE NO GIAI (bai toan GHI HAI NOI):
 *
 *   Order commit vao Postgres nghiep vu   ✔
 *   tien trinh CHET                       ✖
 *   Hatchet chua bao gio nhan trigger     ✖  -> viec BIEN MAT, khong ai biet
 *
 * Hai ben nam o hai co so du lieu khac nhau nen KHONG co giao dich chung. Bat ky thiet ke nao
 * dang "commit xong roi goi engine" deu co cua so nay, va cua so do khong thu nho ve 0 duoc.
 *
 * Cach dong no: ghi mot hang OUTBOX **trong cung `$transaction`** voi thay doi nghiep vu. Sau do
 * mot dispatcher rieng doc hang do va goi engine. Neu tien trinh chet o bat ky diem nao:
 *
 *   chet TRUOC commit  -> ca thay doi nghiep vu lan hang outbox deu khong ton tai. Nhat quan.
 *   chet SAU commit    -> hang outbox DA nam trong DB. Tick sau gui no di. Khong mat.
 *
 * ---------------------------------------------------------------------------
 * DAY KHONG PHAI WORKFLOW ENGINE THU HAI. Ranh gioi phai giu chat:
 *
 *   OUTBOX  chi lam MOT viec: dua duoc mot su kien tu DB nghiep vu sang engine, du bao nhieu lan
 *           thu. Khong buoc, khong cay thuc thi, khong lich su, khong replay.
 *   HATCHET so huu: buoc, lan thu, lich su run, cho ben vung, huy, replay, dashboard.
 *
 * Neu co ai them `steps`/`attempts chi tiet`/`replay` vao day, do la luc ta bat dau viet lai
 * chinh thu vua chon Hatchet de khoi phai viet.
 *
 * ---------------------------------------------------------------------------
 * CO CHE NHAN VIEC lay nguyen tu `campaigns/prisma-campaign.repository.ts` (`claimDue`):
 * lease co han + nhan viec nguyen tu + backoff luy thua. Da chay that, khong phat minh lai.
 */

export const WORKFLOW_OUTBOX_STATUSES = [
  'pending',
  'claimed',
  'dispatched',
  'failed',
  'cancelled',
] as const;
export type WorkflowOutboxStatus = (typeof WORKFLOW_OUTBOX_STATUSES)[number];

/** Mot su kien nghiep vu cho duoc ban giao. */
export interface NewWorkflowOutboxEntry {
  /**
   * Khoa thao tac cua Nexagnet (`operation-key.ts`) — DUY NHAT.
   * Chinh no lam cho "xep hai lan" tro thanh vo hai: hai lan ghi cung mot khoa ra mot hang.
   */
  readonly operationKey: string;
  readonly workflowKey: string;
  readonly workflowVersion: string;
  readonly entityType: string;
  readonly entityId: string;
  /** DA qua `buildWorkflowInput` truoc khi toi day. Repository khong lam sach ho. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** DA qua `buildWorkflowMetadata`. */
  readonly metadata: Readonly<Record<string, string>>;
  readonly traceId?: string;
  readonly maxAttempts: number;
  readonly baseBackoffSeconds: number;
}

export interface WorkflowOutboxEntry extends NewWorkflowOutboxEntry {
  readonly id: string;
  readonly status: WorkflowOutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly engineRunId: string | null;
  readonly lastError: string | null;
}

/**
 * Tay cam giao dich cua ben goi.
 *
 * CO Y de `unknown`: cong nay khong duoc biet Prisma ton tai. Hien thuc Prisma doi mot
 * `Prisma.TransactionClient`; hien thuc trong bo nho bo qua tham so nay.
 */
export type WorkflowOutboxTransaction = unknown;

export abstract class WorkflowOutboxRepository {
  /**
   * Xep mot su kien. Truyen `tx` de hang nay nam TRONG CUNG giao dich voi thay doi nghiep vu —
   * do la toan bo ly do lop nay ton tai. Goi khong kem `tx` chi dung cho luong khong co trang
   * thai nghiep vu di kem.
   */
  abstract enqueue(
    entry: NewWorkflowOutboxEntry,
    tx?: WorkflowOutboxTransaction,
  ): Promise<WorkflowOutboxEntry>;

  abstract claimDue(
    workerId: string,
    now: Date,
    leaseSeconds: number,
    limit: number,
  ): Promise<WorkflowOutboxEntry[]>;

  abstract markDispatched(id: string, engineRunId: string, now: Date): Promise<void>;

  /** Tra hang ve hang doi voi backoff, hoac danh `failed` khi da het so lan thu. */
  abstract markAttemptFailed(id: string, error: string, now: Date): Promise<void>;

  abstract findByOperationKey(operationKey: string): Promise<WorkflowOutboxEntry | null>;

  abstract countPending(): Promise<number>;
  abstract countFailed(): Promise<number>;
}

interface Row extends WorkflowOutboxEntry {
  claimedBy: string | null;
  claimExpiresAt: Date | null;
}

/**
 * Hien thuc TRONG BO NHO — mac dinh khi `PERSISTENCE=memory` (demo/CI khong can DB).
 *
 * Giu DUNG ngu nghia cua ban Postgres: khoa duy nhat, lease, backoff luy thua, tran so lan thu.
 * Neu hai ban lech ngu nghia thi bo test se xanh o day va hong o production — dung kieu sai ma
 * mot hien thuc gia phai tranh bang moi gia.
 */
export class InMemoryWorkflowOutboxRepository extends WorkflowOutboxRepository {
  private readonly rows = new Map<string, Row>();
  private sequence = 0;

  async enqueue(entry: NewWorkflowOutboxEntry): Promise<WorkflowOutboxEntry> {
    const existing = this.rows.get(entry.operationKey);
    // Xep lai cung mot khoa la VO HAI, khong phai loi: mot lan thu lai cua tang tren khong duoc
    // bien thanh hai lan giao viec.
    if (existing) return existing;

    this.sequence += 1;
    const row: Row = {
      ...entry,
      id: `outbox-${this.sequence}`,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      engineRunId: null,
      lastError: null,
      claimedBy: null,
      claimExpiresAt: null,
    };
    this.rows.set(entry.operationKey, row);
    return row;
  }

  async claimDue(
    workerId: string,
    now: Date,
    leaseSeconds: number,
    limit: number,
  ): Promise<WorkflowOutboxEntry[]> {
    const claimed: WorkflowOutboxEntry[] = [];
    for (const [key, row] of this.rows) {
      if (claimed.length >= limit) break;
      const dueNow = row.status === 'pending' && (!row.nextAttemptAt || row.nextAttemptAt <= now);
      const leaseExpired =
        row.status === 'claimed' && row.claimExpiresAt !== null && row.claimExpiresAt <= now;
      if (!dueNow && !leaseExpired) continue;

      const next: Row = {
        ...row,
        status: 'claimed',
        attempts: row.attempts + 1,
        claimedBy: workerId,
        claimExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
      };
      this.rows.set(key, next);
      claimed.push(next);
    }
    return claimed;
  }

  async markDispatched(id: string, engineRunId: string, _now: Date): Promise<void> {
    this.update(id, (row) => ({
      ...row,
      status: 'dispatched',
      engineRunId,
      lastError: null,
      claimedBy: null,
      claimExpiresAt: null,
    }));
  }

  async markAttemptFailed(id: string, error: string, now: Date): Promise<void> {
    this.update(id, (row) => {
      const exhausted = row.attempts >= row.maxAttempts;
      return {
        ...row,
        status: exhausted ? 'failed' : 'pending',
        lastError: error,
        // Backoff luy thua tinh tu SO LAN DA THU, khong tu thoi diem — nen no on dinh ke ca khi
        // dispatcher bi restart giua chung.
        nextAttemptAt: exhausted
          ? null
          : new Date(now.getTime() + backoffMs(row.baseBackoffSeconds, row.attempts)),
        claimedBy: null,
        claimExpiresAt: null,
      };
    });
  }

  async findByOperationKey(operationKey: string): Promise<WorkflowOutboxEntry | null> {
    return this.rows.get(operationKey) ?? null;
  }

  async countPending(): Promise<number> {
    return [...this.rows.values()].filter(
      (row) => row.status === 'pending' || row.status === 'claimed',
    ).length;
  }

  async countFailed(): Promise<number> {
    return [...this.rows.values()].filter((row) => row.status === 'failed').length;
  }

  private update(id: string, patch: (row: Row) => Row): void {
    for (const [key, row] of this.rows) {
      if (row.id !== id) continue;
      this.rows.set(key, patch(row));
      return;
    }
  }
}

/** Backoff luy thua co tran — cung cong thuc voi hang doi chien dich. */
export function backoffMs(baseSeconds: number, attempts: number): number {
  const capped = Math.min(attempts, 10);
  return baseSeconds * 1_000 * 2 ** Math.max(0, capped - 1);
}
