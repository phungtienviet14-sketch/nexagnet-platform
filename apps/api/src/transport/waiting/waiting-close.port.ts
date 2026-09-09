import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import type { DeliveryWaitingSession } from './waiting.types.js';

/**
 * CAU NOI mot chieu tu moc van hanh sang phien cho — `#279` O4.
 *
 * ============================================================================================
 * VI SAO MOT CONG, KHONG PHAI MOT LOI GOI THANG
 * ============================================================================================
 *
 * `CheckpointService` la ma DA VAO `main` cua `#243` F1. No khong duoc biet phien cho la gi: mot
 * khach van tai co the bat moc hien truong ma khong bao gio dung den khoang cho nguoi nhan, va
 * luc do mot phu thuoc cung se bat ho nap ca bang phien cho.
 *
 * Nen cai `CheckpointService` cam la cong nay, `@Optional()`. Vang mat cong ⇒ ghi moc van chay
 * binh thuong. Co cong ⇒ moc `DELIVERY_ACCEPTED` dong phien cho dang mo cua chinh chang do.
 *
 * ============================================================================================
 * VI SAO CONG NAY DUOC GOI CA O DUONG GUI LAI
 * ============================================================================================
 *
 * `CheckpointService.append` tra ve moc cu khi mot lenh duoc gui lai (`CHECKPOINT_REPLAYED`). Neu
 * cong nay chi duoc goi o duong GHI MOI thi mot lan mat song dung giua hai buoc — moc da ghi,
 * phien chua dong — se KHONG BAO GIO tu sua duoc: moi lan gui lai deu di vao nhanh replay va bo
 * qua viec dong phien.
 *
 * Goi ca hai duong lam lenh nay HOI TU: gui lai bao nhieu lan cung ve cung mot trang thai. Do la
 * dieu `#279` O10 doi (*"retry keeps same identity"*) doc theo huong manh hon — gui lai khong chi
 * khong nhan doi, ma con hoan tat duoc phan con dang do.
 */
export abstract class DeliveryWaitingCloser {
  /**
   * Dong phien cho dang mo cua chang ma moc nay thuoc ve.
   *
   * `null` khi khong co gi de dong, va do la duong THUONG GAP chu khong phai mot loi: phan lon cac
   * lan giao khong he phai cho. Nem o day se lam mot moc — mot su that doc lap — that bai vi mot
   * ban ghi khong ton tai.
   */
  abstract closeByAcceptance(checkpoint: RunCheckpoint): Promise<DeliveryWaitingSession | null>;
}
