import type { BusinessDate } from '../business-date.js';

/**
 * BAN GIAO BIEN NHAN GIAY — `#279` O7.
 *
 * ============================================================================================
 * QUY TRINH THAT MA CHU KHACH DA MO TA
 * ============================================================================================
 *
 *     lai xe cam to bien nhan da ky
 *     -> tra/nop no ve cho B
 *     -> B dung no lam can cu cho quy trinh xac nhan phia A
 *     -> KE TOAN bam `Da ket thuc` tren DON  (Lane K)
 *
 * Ba buoc dau la VAN HANH va thuoc mien nay. Buoc thu tu la THUONG MAI va thuoc Lane K. `#274` va
 * `#279` O7 deu phat bieu ranh gioi do bang cung mot cau:
 *
 *     bien nhan da ve  !=  don da ket thuc ve thuong mai
 *
 * Mien nay KHONG CO mot duong nao dung vao `TransportOrder` hay vao truc nghiem thu.
 * `no-order-completion.spec.ts` quet ca thu muc de giu dieu do — mot yeu cau ve thu KHONG DUOC TON
 * TAI thi khong mot bai hanh vi nao chung minh duoc.
 *
 * ============================================================================================
 * MOI AI CHI GHI DUOC CAI HO BIET
 * ============================================================================================
 *
 * Do la ly do ba trang thai duoc chia cho hai nguoi khac nhau:
 *
 *   · `WITH_DRIVER`              — LAI XE ghi. Chi ho biet to giay dang trong tay ho.
 *   · `RETURNED_TO_OFFICE`       — VAN PHONG ghi. Mot lai xe khai "toi da nop roi" khong phai mot
 *     su that van phong dua vao duoc; nguoi NHAN moi la nguoi xac nhan da nhan.
 *   · `SUBMITTED_FOR_CONFIRMATION` — VAN PHONG ghi. Chi ho biet ho da gui no di.
 *
 * Cho lai xe ghi `RETURNED_TO_OFFICE` se tao ra mot he thong noi rang giay da ve trong khi tren ban
 * cua van phong khong co gi — va do chinh la con so ma Ke toan se dua vao de bam `Da ket thuc`.
 *
 * ============================================================================================
 * `#279` O7 CON DOI MOT DIEU NUA
 * ============================================================================================
 *
 *     *"physical path remains possible even when no digital File is available, using an auditable
 *       external-physical basis rather than a fake file"*
 *
 * Nen mot buoc ban giao co the tro toi mot chung tu ban so (`documentId`) HOAC mang mot cau mo ta
 * ban giay (`externalNote`) — nhung khong duoc TRONG ca hai. Cuong che bang `CHECK`
 * `TransportPhysicalReceiptHandover_basis`.
 */
export const RECEIPT_HANDOVER_STATES = [
  /** To bien nhan da ky dang trong tay lai xe. */
  'WITH_DRIVER',
  /** Van phong DA NHAN duoc to giay. */
  'RETURNED_TO_OFFICE',
  /** Van phong da gui no di cho quy trinh xac nhan phia A. */
  'SUBMITTED_FOR_CONFIRMATION',
] as const;
export type ReceiptHandoverState = (typeof RECEIPT_HANDOVER_STATES)[number];

/**
 * THU TU BAT BUOC. `null` = khong doi buoc nao truoc.
 *
 * Mot chuoi ban giao nhay coc la mot chuoi khong doi chieu duoc voi thuc te: van phong khong the
 * gui di mot to giay ma chinh ho chua ghi la da nhan.
 *
 * `WITH_DRIVER` khong doi gi — mot lai xe co the bam no ngay khi nguoi nhan vua ky.
 */
export const RECEIPT_HANDOVER_PREDECESSOR: Readonly<
  Record<ReceiptHandoverState, ReceiptHandoverState | null>
> = {
  WITH_DRIVER: null,
  RETURNED_TO_OFFICE: 'WITH_DRIVER',
  SUBMITTED_FOR_CONFIRMATION: 'RETURNED_TO_OFFICE',
};

/**
 * MOT BUOC BAN GIAO — hang chi GHI THEM, khong bao gio sua.
 *
 * `sequence` bat dau tu 1 va duy nhat trong mot don, cung khuon `CommercialAcceptanceDecision` cua
 * Lane K. Trang thai HIEN TAI cua mot don la buoc co `sequence` lon nhat — mot phep chieu, khong
 * mot cot.
 */
export interface PhysicalReceiptHandover {
  readonly id: string;
  readonly orderId: string;
  readonly sequence: number;
  readonly state: ReceiptHandoverState;
  readonly legId: string | null;
  /** Chung tu ban so lam can cu, khi co. `null` o duong giay thuan tuy. */
  readonly documentId: string | null;
  /** B dang ban giao cai gi — bat buoc khi khong co ban so. */
  readonly externalNote: string | null;
  readonly driverId: string | null;
  /** Danh tinh tu PHIEN, khong tu than yeu cau — `#279` O12. */
  readonly recordedBy: string;
  /** Gio MAY CHU. Ben goi khong chon duoc gio nay — `#279` O12. */
  readonly recordedAt: Date;
  readonly clientEventId: string;
  readonly note: string | null;
  readonly businessDate: BusinessDate;
  readonly createdAt: Date;
}

/** Lenh cua LAI XE — chi ghi duoc `WITH_DRIVER`, va chi tren don cua chinh ho. */
export interface RecordDriverHandoverCommand {
  readonly orderId: string;
  readonly legId?: string;
  readonly documentId?: string;
  readonly externalNote?: string;
  readonly note?: string;
  readonly clientEventId: string;
  readonly authUserId: string;
}

/** Lenh cua VAN PHONG — hai buoc con lai. */
export interface RecordOfficeHandoverCommand {
  readonly orderId: string;
  readonly state: Exclude<ReceiptHandoverState, 'WITH_DRIVER'>;
  readonly documentId?: string;
  readonly externalNote?: string;
  readonly note?: string;
  readonly clientEventId: string;
  readonly authUserId: string;
}

/** Trang thai HIEN TAI cua mot don, doc tu chuoi buoc. `null` = chua ai ban giao gi. */
export interface ReceiptHandoverStatus {
  readonly orderId: string;
  readonly state: ReceiptHandoverState | null;
  readonly latestAt: Date | null;
  readonly latestBy: string | null;
  readonly history: readonly PhysicalReceiptHandover[];
}
