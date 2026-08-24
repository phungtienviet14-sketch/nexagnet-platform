import type { OrderView } from '@netviet/shared';

/**
 * CONG NHAN VIEC cua mot luot: sau khi agent chay xong, co capability nao muon TU KET THUC luot
 * nay theo duong rieng cua no khong?
 *
 * Vi sao no ton tai. Duong xu ly mot luot co hai ket cuc: hoac mot capability nhan lay luot va
 * dong no theo luat cua chinh no, hoac khong ai nhan va luot di tiep sang duong tra loi tu van
 * chung. Truoc 24/08/2026 nhanh thu nhat duoc viet THANG vao `PipelineService` duoi dang mot
 * cong tu-xac-nhan-don: turn-processing phai import tu vung quyet dinh cua ban hang, phai doc
 * policy ban hang cua tenant, va phai giu mot tham chieu toi `OrdersService`. Nghia la moi khach
 * — ke ca khach khong ban gi — mang theo mot cau hoi ve don hang trong duong xu ly tin cua ho.
 *
 * Cong nay CO Y GIU HEP. No khong phai mot he thong plugin: khong uu tien, khong chuoi handler,
 * khong dang ky dong. Dung mot cau hoi, dung hai cau tra loi. Khi co capability thu hai can nhan
 * viec (vd dat lich hen), luc do moi la luc ban ve viec xep thu tu — khong phai bay gio.
 *
 * `OrderView` la ten kieu cua mot BAN GHI LUOT (xem `turn-records.repository.ts`): ranh gioi da
 * sua la quyen so huu, khong phai luu tru, nen kieu va bang Postgres giu nguyen ten cu.
 */

/** Trang thai van hanh cua luot — do turn-processing biet, khong phai ben nhan viec tu doc. */
export interface TurnOutcomeContext {
  /** `AUTO_SEND` — kill switch VAN HANH cua ca he thong, khong phai policy cua mot capability. */
  readonly killSwitchEnabled: boolean;
  /** Nguoi gui thuoc dien nguoi that duyet tay. */
  readonly manualReview: boolean;
}

/**
 * `claimed: false` = khong ai nhan, luot di tiep. `claimed: true` = da xu ly xong, KE CA khi lan
 * gui that bai — `closed` phan biet hai truong hop do. Gop chung lai la cach chac chan de mot lan
 * gui hong bi ghi nhan nhu mot lan chot thanh cong.
 */
export type TurnOutcome =
  | { readonly claimed: false }
  | { readonly claimed: true; readonly view: OrderView; readonly closed: boolean };

/** Lop truu tuong lam token DI — cung khuon `TurnRecordsRepository`/`ErpPort`. */
export abstract class TurnOutcomePort {
  abstract settle(view: OrderView, context: TurnOutcomeContext): Promise<TurnOutcome>;
}
