/**
 * HANG DOI NGOAI TUYEN cua ung dung lai xe — nua MAY KHACH cua mot giao thuc ma may chu da cuong
 * che san.
 *
 * ============================================================================================
 * VI SAO GOI NAY TON TAI RIENG, VA VI SAO NO KHONG PHU THUOC GI
 * ============================================================================================
 *
 * May chu (`transport-proof`) da co: nhan mot LO ban dinh vi toi da 200 phan tu, moi phan tu mang
 * `clientEventId` rieng; gui lai dung noi dung cu thi tra ban cu (khong ghi hang thu hai); dung
 * lai mot ma su kien cho noi dung KHAC thi tu choi 409. Do la mot hop dong day du — nhung no chi
 * co gia tri neu phia may khach that su GIU duoc viec da bam khi khong co song.
 *
 * Goi nay la phan do, viet mot lan, co test. Neu de moi ung dung tu nghi ra, cai duoc nghi ra se
 * la mot mang trong bo nho — va mot mang trong bo nho mat sach khi he dieu hanh giet tien trinh
 * nen, tuc dung luc mot ung dung bam vi tri hay bi giet nhat.
 *
 * KHONG CO DEPENDENCY: goi nay phai nap duoc tu React Native, noi khong co `node:*`. Moi thu ben
 * ngoai — kho luu, dong ho, duong mang — deu di vao qua tham so.
 */

/** HAI loai viec xep hang. Chung khac nhau o KICH THUOC, nen khac nhau o cach gui. */
export type OutboxItemKind = 'OBSERVATION' | 'PROOF';

/**
 * `BLOCKED` khong phai `FAILED`, va khac biet do quan trong.
 *
 * `PENDING` se duoc thu lai. `BLOCKED` la mot muc ma may chu da tu choi bang mot ly do KHONG doi
 * theo thoi gian (400 sai hinh dang, 403 khong phai chuyen cua minh, 409 trung ma su kien). Thu
 * lai mot muc nhu the mai mai la mot vong lap vo ich, va — te hon — no chan ca hang doi phia sau
 * neu ta gui theo thu tu. Nen no bi dat sang mot ben, van CON DO de nguoi xem, va hang doi chay
 * tiep.
 */
export type OutboxItemState = 'PENDING' | 'BLOCKED';

export interface OutboxAttachment {
  /** Duong dan cuc bo hoac URI noi dung. Goi nay khong doc no; nguoi gui doc. */
  readonly uri: string;
  readonly contentType: string;
  readonly captureMode: 'LIVE_CAMERA' | 'GALLERY' | 'UNKNOWN';
}

export interface OutboxItem {
  /** Khoa dong cuc bo. KHONG gui len may chu. */
  readonly id: string;
  /**
   * KHOA IDEMPOTENCY gui len may chu, sinh MOT LAN luc bam.
   *
   * Sinh lai no o lan gui lai se bien mot lan thu lai thanh mot su kien MOI — va may chu, dung
   * theo hop dong cua no, se ghi them mot hang. Do la cach mot hang doi "an toan" tao ra ban trung.
   */
  readonly clientEventId: string;
  readonly kind: OutboxItemKind;
  /**
   * DONG HO MAY KHACH luc BAM — dong bang tai day, khong bao gio viet lai.
   *
   * Day la bat bien quan trong nhat cua ca goi. Neu mot lan gui lai dat lai `capturedAt` = bay
   * gio, thi mot ban dinh vi ghi luc 14:00 va gui duoc luc 18:00 se den may chu voi nhan 18:00 —
   * va toan bo phep do quang duong, toc do, lien tuc cua may chu se tinh tren mot duong di khong
   * he ton tai. Chinh xac hon: no se im lang tinh sai, chu khong bao loi.
   *
   * May chu ghi `receivedAt` cua RIENG no. Hai dau thoi gian, hai nguon, khong cai nao thay cai
   * nao.
   */
  readonly capturedAt: string;
  /** Than yeu cau da chuan hoa. Voi `PROOF`, day KHONG chua byte anh — xem `attachments`. */
  readonly payload: Readonly<Record<string, unknown>>;
  /**
   * THAM CHIEU toi tep cuc bo, khong phai byte.
   *
   * Giu byte anh trong hang doi la cach nhanh nhat de bien mot hang doi thanh mot van de bo nho:
   * mot ngay 30 lan giao x 3 tam anh 4MB = 360MB nam trong mot bang SQLite. Giu duong dan thi lan
   * gui lai doc lai tu dia, va mot lan tai len dut giua chung khong lam mat gi ca.
   */
  readonly attachments: readonly OutboxAttachment[];
  readonly attempts: number;
  /** Truoc moc nay thi khong dung den — cach backoff duoc LUU, khong tinh lai trong bo nho. */
  readonly nextAttemptAt: string;
  readonly state: OutboxItemState;
  readonly lastError: string | null;
}

export interface EnqueueCommand {
  readonly clientEventId: string;
  readonly kind: OutboxItemKind;
  readonly capturedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attachments?: readonly OutboxAttachment[];
}

/**
 * KET CUC cua mot lan gui, theo goc nhin cua hang doi — BA, khong phai hai.
 *
 * Gop `RETRY` va `REJECTED` thanh mot `boolean` la loi thiet ke de mac nhat o day: mot loi mang
 * (thu lai duoc) va mot yeu cau sai hinh dang (khong bao gio thu lai duoc) se duoc doi xu giong
 * nhau. Neu chon "thu lai tat ca" thi mot muc hong quay vong mai mai; neu chon "bo tat ca" thi mot
 * lan mat song lam mat bang chung.
 */
export type SendOutcome =
  | { readonly kind: 'ACCEPTED' }
  | { readonly kind: 'RETRY'; readonly reason: string }
  | { readonly kind: 'REJECTED'; readonly reason: string };

export interface OutboxPolicy {
  /** Tran mot lo. Mac dinh 200 — dung tran cua `reportObservationBatchSchema` phia may chu. */
  readonly maxBatchSize: number;
  /** Cho lan dau, mili giay. */
  readonly baseDelayMs: number;
  /** Tran cho, mili giay — de mot ngay mat song khong day khoang cho len hang gio. */
  readonly maxDelayMs: number;
}

export const DEFAULT_OUTBOX_POLICY: OutboxPolicy = {
  maxBatchSize: 200,
  baseDelayMs: 2_000,
  maxDelayMs: 300_000,
};

/**
 * TRANG THAI DONG BO cho giao dien — ba con so, khong phai mot cai den xanh/do.
 *
 * "Explicit offline/sync/error UI" cua #235 doi ung dung noi duoc BA dieu khac nhau: con bao nhieu
 * viec chua gui, co viec nao KHONG gui duoc khong, va lan cuoi noi duoc voi may chu la khi nao.
 * Mot co `isOnline` duy nhat khong tra loi duoc cai nao trong ba.
 */
export interface SyncStatus {
  readonly pending: number;
  readonly blocked: number;
  readonly lastAttemptAt: string | null;
  readonly lastError: string | null;
}

/**
 * KHO LUU BEN — giao dien, khong phai hien thuc.
 *
 * Tren may la SQLite (`expo-sqlite`); trong test la bo nho. Do goi nay khong nhap mot thu vien nao
 * nen no chay duoc o ca hai cho ma khong can gia lap he dieu hanh.
 */
export interface OutboxStore {
  /**
   * Them mot muc. NEU `clientEventId` da co thi KHONG them lan hai va KHONG ghi de.
   *
   * Cong nay nam o KHO chu khong o dong co, vi day chinh la cho mot lan bam doi (hai lan cham, mot
   * lan cham roi xoay man hinh) tro thanh hai hang. Tra ve muc dang co de nguoi goi biet.
   */
  append(item: OutboxItem): Promise<OutboxItem>;
  /** Cac muc `PENDING` co `nextAttemptAt <= now`, cu nhat truoc, toi da `limit`. */
  claim(kind: OutboxItemKind, limit: number, now: Date): Promise<readonly OutboxItem[]>;
  /** Gui xong thi BO khoi hang doi — hang doi khong phai mot ban lich su. */
  remove(ids: readonly string[]): Promise<void>;
  /** Van `PENDING`, nhung lui lich va cong so lan. */
  reschedule(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  /** Sang `BLOCKED` — khong thu lai nua, va khong chan cac muc khac. */
  block(id: string, error: string): Promise<void>;
  countByState(): Promise<{ readonly pending: number; readonly blocked: number }>;
  /** Muc bi chan, de giao dien liet ke cho nguoi xem. */
  listBlocked(): Promise<readonly OutboxItem[]>;
}
