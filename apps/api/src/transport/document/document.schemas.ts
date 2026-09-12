import { z } from 'zod';
import { DOCUMENT_CAPTURE_MODES, OPERATIONAL_DOCUMENT_BASES, OPERATIONAL_DOCUMENT_TYPES } from './document.types.js';
import { RECEIPT_HANDOVER_STATES } from './handover.types.js';

/**
 * BIEN VAO HTTP cua chung tu van hanh va ban giao bien nhan.
 *
 * BA DIEU KHONG CO O DAY, va do la phan quan trong nhat cua tep:
 *
 *   · **`orderId`** — ma don duoc GIAI o may chu tu chinh chang. `#279` O13 bai 8:
 *     *"DELIVERY_RECEIPT for Order A cannot satisfy Order B"*. Neu ben goi khai duoc `orderId` thi
 *     ho gan duoc mot to bien nhan cua don nay sang don khac, va Lane K se doc no nhu mot can cu
 *     hop le de bam `Da ket thuc`.
 *   · **`driverId` / `recordedBy`** — danh tinh den tu PHIEN dang nhap.
 *   · **`receivedAt` / `recordedAt`** — gio den tu DONG HO MAY CHU. `#279` O12:
 *     *"`receipt returned` fact cannot be forged by caller-supplied actor/time"*.
 *
 * `.strict()` bien mot truong thua thanh loi 400 on ao thay vi mot truong bi bo qua im lang: mot
 * may khach gui `orderId` phai duoc bao la sai, chu khong duoc tuong rang no da co tac dung.
 */
export const recordDocumentSchema = z
  .object({
    type: z.enum(OPERATIONAL_DOCUMENT_TYPES),
    runId: z.string().min(1),
    legId: z.string().min(1).optional(),
    /** Moc neo — phai la moc CUA CHINH lai xe dang ghi. Cong that o `DocumentService`. */
    checkpointId: z.string().min(1).optional(),
    counterpartySiteId: z.string().min(1).optional(),
    basis: z.enum(OPERATIONAL_DOCUMENT_BASES),
    /** Ma tep DUC cua Nen tang Tep. KHONG BAO GIO la mot dinh vi kho. */
    fileId: z.string().min(1).max(200).optional(),
    externalNote: z.string().trim().max(2000).optional(),
    label: z.string().trim().max(200).optional(),
    captureMode: z.enum(DOCUMENT_CAPTURE_MODES).optional(),
    /**
     * Khoa idempotency do may khach sinh. BAT BUOC — `#279` O10 *"clientEventId generated once ...
     * retry keeps same identity"*. Thieu no thi mot lan bam hai lan tren song yeu se thanh hai to.
     */
    clientEventId: z.string().min(1).max(200),
  })
  .strict();

export type RecordDocumentBody = z.infer<typeof recordDocumentSchema>;

/**
 * BIA MO — `reason` bat buoc va khong duoc rong.
 *
 * Mot to bang chung bi go ra khoi ho so ma khong ai noi vi sao la mot khoang trong khong giai thich
 * duoc trong chinh ho so ma nguoi khac se dua vao de quyet.
 */
export const withdrawDocumentSchema = z
  .object({ reason: z.string().trim().min(1).max(2000) })
  .strict();

export type WithdrawDocumentBody = z.infer<typeof withdrawDocumentSchema>;

/** Duong cua LAI XE — chi ghi duoc `WITH_DRIVER`, nen than yeu cau KHONG mang truong `state`. */
export const driverHandoverSchema = z
  .object({
    orderId: z.string().min(1),
    legId: z.string().min(1).optional(),
    documentId: z.string().min(1).optional(),
    externalNote: z.string().trim().max(2000).optional(),
    note: z.string().trim().max(2000).optional(),
    clientEventId: z.string().min(1).max(200),
  })
  .strict();

export type DriverHandoverBody = z.infer<typeof driverHandoverSchema>;

/**
 * Duong cua VAN PHONG — hai buoc con lai.
 *
 * `WITH_DRIVER` KHONG nam trong danh sach, va do la mot khang dinh: chi lai xe biet to giay dang
 * trong tay ho. Cho van phong ghi ho se tao ra mot su that khong ai chung kien.
 */
export const officeHandoverSchema = z
  .object({
    orderId: z.string().min(1),
    state: z.enum(
      RECEIPT_HANDOVER_STATES.filter((state) => state !== 'WITH_DRIVER') as unknown as [
        'RETURNED_TO_OFFICE',
        'SUBMITTED_FOR_CONFIRMATION',
      ],
    ),
    documentId: z.string().min(1).optional(),
    externalNote: z.string().trim().max(2000).optional(),
    note: z.string().trim().max(2000).optional(),
    clientEventId: z.string().min(1).max(200),
  })
  .strict();

export type OfficeHandoverBody = z.infer<typeof officeHandoverSchema>;
