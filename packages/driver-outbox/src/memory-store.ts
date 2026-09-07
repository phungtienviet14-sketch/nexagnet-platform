import type { OutboxItem, OutboxItemKind, OutboxStore } from './outbox.types.js';

/**
 * Kho trong bo nho — hien thuc THAM CHIEU cua `OutboxStore`.
 *
 * No khong ben, nen no khong dung duoc tren may that. Cong dung cua no la khac: no la ban mo ta
 * CHAY DUOC cua ngu nghia ma hien thuc SQLite phai khop. Moi bai test cua goi nay chay tren no,
 * nen khi ai do viet ban SQLite, cai phai dat khong con la mot doan van trong tai lieu.
 *
 * Mot dieu no CO Y lam giong SQLite: `append` chan trung `clientEventId` — tren may do se la mot
 * `UNIQUE INDEX`, va o day la mot `Map`. Neu de dong co lo phan do thi hai lan cham vao nut "Da
 * giao" se tao hai hang, va may chu — dung theo hop dong cua no — se nhan chung nhu hai su kien
 * khac nhau chi vi chung mang hai ma khac nhau.
 */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly rows = new Map<string, OutboxItem>();
  private readonly byEventId = new Map<string, string>();

  async append(item: OutboxItem): Promise<OutboxItem> {
    const existingId = this.byEventId.get(item.clientEventId);
    if (existingId !== undefined) {
      const existing = this.rows.get(existingId);
      // Tra ban DANG CO, khong ghi de: `capturedAt` cua lan bam dau tien la cai dung.
      if (existing !== undefined) return existing;
    }
    this.rows.set(item.id, item);
    this.byEventId.set(item.clientEventId, item.id);
    return item;
  }

  async claim(kind: OutboxItemKind, limit: number, now: Date): Promise<readonly OutboxItem[]> {
    return (
      [...this.rows.values()]
        .filter(
          (row) =>
            row.kind === kind &&
            row.state === 'PENDING' &&
            Date.parse(row.nextAttemptAt) <= now.getTime(),
        )
        // CU NHAT TRUOC, theo dong ho luc BAM. Gui theo thu tu bam thi chuoi ban dinh vi den may
        // chu dung trat tu no da xay ra, va phep do lien tuc ben do khong thay mot buoc lui gia.
        .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
        .slice(0, limit)
    );
  }

  async remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row === undefined) continue;
      this.byEventId.delete(row.clientEventId);
      this.rows.delete(id);
    }
  }

  async reschedule(id: string, nextAttemptAt: Date, error: string): Promise<void> {
    const row = this.rows.get(id);
    if (row === undefined) return;
    this.rows.set(id, {
      ...row,
      attempts: row.attempts + 1,
      nextAttemptAt: nextAttemptAt.toISOString(),
      lastError: error,
    });
  }

  async block(id: string, error: string): Promise<void> {
    const row = this.rows.get(id);
    if (row === undefined) return;
    this.rows.set(id, {
      ...row,
      attempts: row.attempts + 1,
      state: 'BLOCKED',
      lastError: error,
    });
  }

  async countByState(): Promise<{ readonly pending: number; readonly blocked: number }> {
    let pending = 0;
    let blocked = 0;
    for (const row of this.rows.values()) {
      if (row.state === 'BLOCKED') blocked += 1;
      else pending += 1;
    }
    return { pending, blocked };
  }

  async listBlocked(): Promise<readonly OutboxItem[]> {
    return [...this.rows.values()].filter((row) => row.state === 'BLOCKED');
  }

  /** CHI DUNG TRONG TEST — doc mot dong theo ma su kien de kiem `capturedAt` khong bi viet lai. */
  peek(clientEventId: string): OutboxItem | null {
    const id = this.byEventId.get(clientEventId);
    return id === undefined ? null : (this.rows.get(id) ?? null);
  }
}
