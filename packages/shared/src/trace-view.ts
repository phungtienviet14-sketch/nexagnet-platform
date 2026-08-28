/**
 * MO HINH HIEN THI cua mot luot xu ly — thu console ve ra man hinh.
 *
 * CO Y KHONG phai `TelemetryRecord` (kieu noi bo cua API): ban ghi tho mang spanId/parentSpanId
 * va quan he cha-con phai tu dung lai. Neu day nguyen no sang web thi logic dung cay bi viet hai
 * lan — mot ban trong `tools/trace-view.mjs`, mot ban trong React — va hai ban do se troi khoi
 * nhau. API lam phang san thanh danh sach co `depth`; web chi con viec ve.
 */

import type { SourceContext, SourceLocation } from './source-location.js';

export type TraceNodeKind = 'step' | 'decision' | 'state' | 'data' | 'ai';

/** Ket cuc de to mau. `ok`/`error` cho buoc; ba gia tri con lai cho quyet dinh. */
export type TraceNodeOutcome = 'ok' | 'error' | 'allowed' | 'denied' | 'degraded';

export interface TraceNode {
  readonly kind: TraceNodeKind;
  /** Do sau trong cay, da tinh san. */
  readonly depth: number;
  /** Nhan chinh: ten buoc, ten cong quyet dinh, ten thuc the… */
  readonly label: string;
  readonly outcome?: TraceNodeOutcome;
  /** Ma ly do CO KIEU — thu tra loi cau "vi sao". */
  readonly reason?: string;
  /** Nhan tieng Viet cua `reason`, de nguoi khong thuoc du an van doc duoc. */
  readonly reasonLabel?: string;
  readonly durationMs?: number;
  /** Mot dong phu: delta du lieu, chuyen trang thai, so lieu nguong… */
  readonly detail?: string;
  /**
   * `true` = chi tiet KY THUAT, console AN MAC DINH.
   *
   * Yeu cau cua nguoi dung: "khong hien thi raw technical spans mac dinh". Nut gat trong UI mo
   * ra khi can, chu khong xoa han — mot buoc chay 4 giay van la manh moi quan trong.
   */
  readonly technical?: boolean;
  /**
   * CHO TRONG MA NGUON da sinh ra nut nay.
   *
   * TUY CHON, va vang mat la mot cau tra loi hop le — khong phai mot loi. Hai truong hop that:
   * ten buoc duoc viet ra o nhieu dong trong cung mot tep (luc do co `filePath`, khong co
   * `line`), va nut khong thuoc loai co the tra cuu (chuyen trang thai, thay doi du lieu).
   *
   * Console PHAI noi ra khi thieu. Mot o trong doc len la "khong co van de o day"; mot cau
   * "chua co vi tri ma nguon cho buoc nay" doc len dung nhu no la.
   */
  readonly source?: SourceLocation;
}

/**
 * KHO NAO DA TRA LOI cau hoi nay.
 *
 *   `buffer`      vong dem trong tien trinh — luot vua chay, ban ghi nguyen ven;
 *   `historical`  kho quan sat ben ngoai — luot da song qua mot lan khoi dong lai hoac mot lan
 *                 phat hanh moi.
 *
 * KHONG PHAI TRANG TRI. Khong co truong nay thi "Debug View van mo duoc luot cu" va "luot cu
 * tinh co con trong bo nho" nhin y het nhau tu ben ngoai, va cau dau tro thanh mot loi khang
 * dinh khong ai kiem duoc.
 */
export type TraceOrigin = 'buffer' | 'historical';

export interface TraceView {
  readonly traceId: string;
  readonly tenant: string;
  readonly environment: string;
  /** Vang mat = ban trien khai cu, truoc khi duong lui lich su ton tai. */
  readonly origin?: TraceOrigin;
  /** 12 ky tu dau cua git SHA. Vang mat = chay local/khong biet release. */
  readonly release?: string;
  readonly startedAt: string;
  /** chatId / orderId / messageId / intent… — de doi chieu nhanh. */
  readonly anchors: Readonly<Record<string, string>>;
  readonly nodes: readonly TraceNode[];
  /** Tong thoi gian cua buoc ngoai cung. */
  readonly totalMs?: number;
  /**
   * MA NGUON nao da sinh ra luot nay — repo va git SHA DAY DU.
   *
   * ---------------------------------------------------------------------------
   * VI SAO O DAY chu khong o tung nut:
   *
   * Moi ban ghi trong mot luot deu do CUNG MOT tien trinh phat ra, nen chung khong the thuoc hai
   * ban phat hanh. Nhet SHA vao tung nut se lap lai 40 ky tu vai chuc lan, va — te hon — cho
   * phep bieu dien mot trang thai khong the co that.
   *
   * KHAC voi `release` o tren: `release` la 12 ky tu DE DOC. Day la SHA DAY DU DE DUNG LIEN KET.
   * Cat ngan mot SHA roi dung no dung permalink la cach tao ra mot duong dan 404 vao dung luc
   * nguoi ta can no chay.
   */
  readonly sourceContext?: SourceContext;
}
