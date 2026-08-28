import type { StoredTrace } from '../recent-traces.sink.js';

/**
 * DUONG LUI VE LICH SU cua Debug View.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA MOT CONG (`port`) CHU KHONG PHAI MOT LOP:
 *
 * `RecentTracesSink` la vong dem TRONG TIEN TRINH: mat khi restart, va chi giu N luot gan nhat.
 * Do la mot danh doi da duoc ghi ra tu dau, khong phai mot thieu sot. Cai thieu la duong DOC khi
 * vong dem khong con giu — va duong do di ra ngoai tien trinh, toi mot kho ma tang nghiep vu
 * khong duoc phep biet ten.
 *
 * Nen o day chi co MOT cau hoi ("cho toi luot nay/luot cua don nay") va MOT tap cau tra loi. Ai
 * tra loi — ClickHouse hom nay, mot thu khac ngay mai — la viec cua `app-composition.ts`.
 *
 * ---------------------------------------------------------------------------
 * BA KET CUC, KHONG PHAI HAI. Day la diem thiet ke quan trong nhat cua tep nay:
 *
 *   `found`        hoi duoc, va co du lieu;
 *   `not_found`    hoi duoc, va kho thuc su khong co gi;
 *   `unavailable`  KHONG hoi duoc — het gio, sai khoa, chua cau hinh, tenant khong xac dinh.
 *
 * Gop `unavailable` vao `not_found` la mot loi im lang co that: no bien "kho quan sat dang hong"
 * thanh "luot nay khong ton tai", va nguoi debug se di tim mot con bo o cho khac. Man hinh phai
 * noi duoc "chua tra loi duoc" khac voi "khong co".
 */

/** Vi sao khong hoi duoc. CO MA, khong phai cau van — de loc va de dem. */
export type HistoricalUnavailableReason =
  /** Chua cau hinh duong doc nao (chay local, chay CI, stack chua bat quan sat). */
  | 'NOT_CONFIGURED'
  /** Tien trinh khong xac dinh duoc no phuc vu khach nao ⇒ TU CHOI doc. Xem `tenantGuard`. */
  | 'TENANT_UNRESOLVED'
  /** Het thoi gian cho. */
  | 'TIMEOUT'
  /** Kho tu choi hoac tra loi khong hop le. */
  | 'STORE_ERROR';

export type HistoricalLookup =
  | { readonly status: 'found'; readonly traces: readonly StoredTrace[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable'; readonly reason: HistoricalUnavailableReason };

export const HISTORICAL_NOT_CONFIGURED: HistoricalLookup = {
  status: 'unavailable',
  reason: 'NOT_CONFIGURED',
};

/**
 * Lop truu tuong (khong phai `interface`) vi Nest can mot TOKEN tiem duoc luc chay.
 *
 * KHONG co tham so `tenant` o bat ky phuong thuc nao, va do la CO Y — xem §8.1 dieu 1 cua
 * `reference-platform-stack.md`. Khach nao duoc doc la thuoc tinh cua BAN TRIEN KHAI, do tien
 * trinh tu phan giai luc khoi dong; mot tham so o day se bien no thanh thu ma ben goi tu khai,
 * tuc dung lop lo hong ma mo hinh cach ly duoc chon de tranh.
 */
export abstract class HistoricalTraceReaderPort {
  /** Mot luot theo `traceId`. Nhieu nhat mot ket qua. */
  abstract byTraceId(traceId: string): Promise<HistoricalLookup>;

  /**
   * MOI luot con giu duoc cua mot don, CU NHAT TRUOC — cung hop dong voi
   * `RecentTracesSink.findAllByOrderId`, de hai duong tra ve cung mot hinh dang.
   */
  abstract byOrderId(orderId: string): Promise<HistoricalLookup>;
}
