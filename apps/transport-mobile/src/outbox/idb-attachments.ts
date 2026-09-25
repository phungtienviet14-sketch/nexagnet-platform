import type { OutboxAttachment } from '@netviet/driver-outbox';
import { ApiError } from '../api/errors';
import { INDEX, STORE, requestResult, transactionDone } from './idb';

/**
 * TEP DINH KEM CUA HANG DOI tren PWA — byte anh nam TRONG IndexedDB, khong phai o mot duong dan.
 *
 * Tren may, tep duoc chep vao thu muc tai lieu va hang doi giu duong dan. Trinh duyet khong co thu
 * muc ben: `blob:` cua camera/thu vien chet cung trang, `data:` thi qua to de nhoi vao payload. Nen
 * byte duoc chep NGAY luc chon anh vao kho `outbox_files` va hang doi giu `idb://<id>` — mot tham
 * chieu, dung hop dong "khong giu byte trong hang doi" cua `@netviet/driver-outbox`.
 *
 * Luu `ArrayBuffer` + kieu, khong luu `Blob`: Safari iOS tung lam hong Blob trong IndexedDB sau khi
 * tai lai trang (WebKit, "WebKitBlobResource error 1"); ArrayBuffer la structured clone thuan.
 */
export const IDB_URI_PREFIX = 'idb://';

/**
 * Tep MOI chep chua kip vao hang (chon anh -> bam gui mat vai giay) khong duoc bi don nham boi mot
 * lan don chay dung luc do. Tren may cung co khe nay; o day chan bang tuoi tep.
 */
export const SWEEP_GRACE_MS = 10 * 60 * 1000;

interface FileRecord {
  readonly id: string;
  readonly bytes: ArrayBuffer;
  readonly contentType: string;
  readonly createdAtMs: number;
}

function extensionFor(contentType: string): string {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

function idOf(uri: string): string | null {
  return uri.startsWith(IDB_URI_PREFIX) ? uri.slice(IDB_URI_PREFIX.length) : null;
}

function missing(uri: string): ApiError {
  // Tu choi VINH VIEN (BLOCKED, hien o trung tam dong bo) chu khong thu lai mai: tep da mat khoi
  // may (nguoi dung xoa du lieu trang) thi khong lan thu nao lam no hien ra lai.
  return new ApiError(
    'DOMAIN',
    `Tệp đính kèm không còn trên máy (${uri}) — chụp lại chứng từ.`,
    null,
    'OUTBOX_ATTACHMENT_MISSING',
  );
}

export class IdbAttachmentStore {
  constructor(
    private readonly db: IDBDatabase,
    private readonly now: () => number = () => Date.now(),
    private readonly newId: () => string = () => globalThis.crypto.randomUUID(),
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** Chep byte cua `blob:` / `data:` / `http(s):` vao kho. Tra tham chieu `idb://<id>`. */
  async persist(
    sourceUri: string,
    contentType: string,
    captureMode: OutboxAttachment['captureMode'],
  ): Promise<OutboxAttachment> {
    const response = await this.fetchImpl(sourceUri);
    if (!response.ok) throw new Error(`Không đọc được tệp vừa chọn (${response.status})`);
    const bytes = await response.arrayBuffer();
    const record: FileRecord = { id: this.newId(), bytes, contentType, createdAtMs: this.now() };
    const tx = this.db.transaction(STORE.files, 'readwrite');
    tx.objectStore(STORE.files).add(record);
    await transactionDone(tx);
    return { uri: `${IDB_URI_PREFIX}${record.id}`, contentType, captureMode };
  }

  /** `FormData` voi mot `File` THAT (trinh duyet tu dat multipart boundary). */
  async formWithFile(
    attachment: OutboxAttachment,
    fields: Readonly<Record<string, string>>,
  ): Promise<FormData> {
    const id = idOf(attachment.uri);
    if (!id) throw missing(attachment.uri);
    const tx = this.db.transaction(STORE.files, 'readonly');
    const record = (await requestResult(tx.objectStore(STORE.files).get(id))) as
      FileRecord | undefined;
    if (!record) throw missing(attachment.uri);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const name = `${id}.${extensionFor(attachment.contentType)}`;
    const file = new File([record.bytes], name, { type: attachment.contentType });
    form.append('file', file, name);
    return form;
  }

  /** Xoa tep khong con muc nao tham chieu va da qua tuoi an toan. Tra so tep da xoa. */
  async sweep(referenced: ReadonlySet<string>): Promise<number> {
    const cutoff = this.now() - SWEEP_GRACE_MS;
    let removed = 0;
    const tx = this.db.transaction(STORE.files, 'readwrite');
    const files = tx.objectStore(STORE.files);
    // Con tro KHOA tren chi muc tuoi: chi doc id, khong nap hang MB anh chi de quyet xoa hay giu.
    const cursorRequest = files.index(INDEX.fileAge).openKeyCursor(IDBKeyRange.upperBound(cutoff));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const id = String(cursor.primaryKey);
      if (!referenced.has(`${IDB_URI_PREFIX}${id}`)) {
        files.delete(id);
        removed += 1;
      }
      cursor.continue();
    };
    await transactionDone(tx);
    return removed;
  }
}
