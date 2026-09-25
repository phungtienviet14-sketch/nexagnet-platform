/**
 * INDEXEDDB CUA PWA — mot co so du lieu, nam kho, mo bang `indexedDB` THAT cua trinh duyet (test
 * dung `fake-indexeddb`, cung API).
 *
 * Vi sao IndexedDB ma khong phai `expo-sqlite` ban web: ban web cua no chay SQLite WASM trong mot
 * worker ma Metro khong dong goi duoc (do 25/09/2026: `expo export --platform web` do o
 * `wa-sqlite.wasm`), va ke ca khi dong goi duoc no can OPFS + tieu de COOP/COEP. IndexedDB co san
 * o moi trinh duyet ma PWA nham toi (Safari iOS 16.4+, Chrome Android), ben qua tat/mo trinh duyet.
 *
 * Moi thao tac viet bang CALLBACK trong mot giao dich, chi `await` khi giao dich XONG. IndexedDB tu
 * commit ngay khi khong con yeu cau nao cho va luong JS nha tay: mot `await` xen giua hai yeu cau
 * (doc tep, fetch — o trinh duyet cu ca Promise cua chinh yeu cau IDB) dong giao dich som, yeu cau
 * sau nem `TransactionInactiveError`, va thao tac nhieu buoc mat tinh nguyen tu.
 */
export const OUTBOX_IDB_NAME = 'nexagent-outbox';
const OUTBOX_IDB_VERSION = 1;

export const STORE = {
  items: 'outbox_items',
  progress: 'outbox_progress',
  sent: 'outbox_sent',
  kv: 'app_kv',
  files: 'outbox_files',
} as const;

/** Chi muc — ten dat theo cot, thu tu cot la thu tu sap xep. */
export const INDEX = {
  /** UNIQUE: cong chong bam doi, giong `UNIQUE (scope, client_event_id)` cua SQLite. */
  scopeEvent: 'scope_event',
  /** claim: dung loai + PENDING, cu nhat truoc (`capturedAtMs`, roi `id`). */
  claim: 'scope_kind_state_captured',
  /** liet ke / dem theo trang thai trong mot pham vi. */
  scopeState: 'scope_state_captured',
  /** so da gui cua mot pham vi, theo moc gui. */
  sentRecent: 'scope_sent',
  /** tep dinh kem theo tuoi — don tep ma KHONG nap byte anh vao bo nho. */
  fileAge: 'created',
} as const;

function migrate(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const items = db.createObjectStore(STORE.items, { keyPath: 'id' });
    items.createIndex(INDEX.scopeEvent, ['scope', 'clientEventId'], { unique: true });
    items.createIndex(INDEX.claim, ['scope', 'kind', 'state', 'capturedAtMs', 'id']);
    items.createIndex(INDEX.scopeState, ['scope', 'state', 'capturedAtMs', 'id']);
    db.createObjectStore(STORE.progress, { keyPath: ['itemId', 'step'] });
    const sent = db.createObjectStore(STORE.sent, { keyPath: 'id' });
    sent.createIndex(INDEX.sentRecent, ['scope', 'sentAtMs', 'id']);
    db.createObjectStore(STORE.kv, { keyPath: 'key' });
    const files = db.createObjectStore(STORE.files, { keyPath: 'id' });
    files.createIndex(INDEX.fileAge, 'createdAtMs');
  }
}

export function openOutboxIdb(
  factory: IDBFactory = globalThis.indexedDB,
  name: string = OUTBOX_IDB_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error('Trình duyệt này không có IndexedDB — không lưu được việc khi mất sóng.'));
      return;
    }
    const request = factory.open(name, OUTBOX_IDB_VERSION);
    request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion);
    request.onsuccess = () => {
      const db = request.result;
      // Mot tab chay ban MOI (sau cap nhat) xin nang phien ban: tab cu nhuong ngay, khong chan no.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Không mở được IndexedDB'));
  });
}

let shared: Promise<IDBDatabase> | null = null;

/** Ket noi dung chung cua ung dung — mo MOT lan, mo lai neu lan truoc hong. */
export function sharedOutboxIdb(): Promise<IDBDatabase> {
  shared ??= openOutboxIdb().then(
    (db) => {
      const previous = db.onversionchange;
      db.onversionchange = (event) => {
        shared = null;
        previous?.call(db, event);
      };
      return db;
    },
    (error: unknown) => {
      shared = null;
      throw error;
    },
  );
  return shared;
}

/** Giao dich XONG (commit) — hoac loi/huy. Ket qua chi dang tin sau moc nay. */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Giao dịch IndexedDB lỗi'));
    tx.onabort = () => reject(tx.error ?? new Error('Giao dịch IndexedDB bị huỷ'));
  });
}

/** Mot yeu cau le (ngoai chuoi callback) thanh Promise. */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Yêu cầu IndexedDB lỗi'));
  });
}

/**
 * Moi khoa MANG bat dau bang `prefix`. Mang dai hon ma cung tien to luon lon hon tien to, va mot
 * mang (`[]`) lon hon moi so/chuoi — nen `[...prefix, []]` la can tren chac chan.
 */
export function prefixRange(prefix: readonly IDBValidKey[]): IDBKeyRange {
  return IDBKeyRange.bound([...prefix], [...prefix, []]);
}
