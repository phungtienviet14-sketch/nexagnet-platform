import type { TelemetryService } from '../observability/telemetry.service.js';

/** Doi so cua `TelemetryService.stateChange` — lay tu chinh no de khong the truot nghia. */
export type StateChangeEvent = Parameters<TelemetryService['stateChange']>[0];

/**
 * BO DEM CHUYEN TRANG THAI cho tron ven mot giao dich.
 *
 * ## Vi sao no phai ton tai
 *
 * `atomic()` da buoc moi cau ghi cua mot thao tac nghiep vu vao mot giao dich, nen POSTGRES thi
 * dung. Nhung telemetry khong nam trong giao dich do: no bay ra OTel ngay tai cho goi. Voi mot
 * thao tac nhieu buoc, dieu do co nghia la:
 *
 * ```text
 * supersedeSource()
 *   tx.makeSourceEffective(next)   -> ghi DB, VA phat "APPROVED -> EFFECTIVE"
 *   tx.transitionSource(previous)  -> HONG
 *   Postgres roll back             -> `next` van dang APPROVED
 *   ClickStack                     -> van dang noi `next` da EFFECTIVE
 * ```
 *
 * Su that nghiep vu thi dung, con su that BANG CHUNG thi noi sai — va bang chung la thu duy nhat
 * con lai khi phai lan vet mot su co ba tuan sau. Mot Debug View noi ve mot lan chuyen trang thai
 * KHONG HE COMMIT thi te hon la khong co Debug View, vi nguoi doc tin no.
 *
 * ## Duong nao duoc hoan, duong nao khong
 *
 * Chi CHUYEN TRANG THAI phai doi commit — do la khang dinh ve mot thu da xay ra trong kho.
 * `telemetry.decision()` van phat ngay: no ghi lai mot lan CAN NHAC ("luat co cho phep khong"),
 * va lan can nhac do that su da dien ra, ke ca khi cau ghi sau do hong. Tron ca hai lai se lam
 * mat dung thu dang can khi go loi: chuoi quyet dinh dan toi that bai.
 */
export class CommittedStateChanges {
  private readonly pending: StateChangeEvent[] = [];

  record(event: StateChangeEvent): void {
    this.pending.push(event);
  }

  /**
   * Day het ra so nhat ky. CHI duoc goi sau khi giao dich commit thanh cong.
   *
   * Lay het ra khoi hang doi truoc khi phat: goi hai lan khong nhan doi su kien, va mot bo dem
   * bi bo quen thi im lang chu khong ro ri.
   */
  flush(telemetry?: TelemetryService): void {
    const events = this.pending.splice(0, this.pending.length);
    for (const event of events) telemetry?.stateChange(event);
  }

  /** So su kien dang cho — de bai test khang dinh duoc "chua co gi thoat ra". */
  get size(): number {
    return this.pending.length;
  }
}
