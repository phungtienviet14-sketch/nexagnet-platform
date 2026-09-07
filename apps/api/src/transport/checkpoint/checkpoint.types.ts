import type { BusinessDate } from '../business-date.js';

/**
 * MOC VAN HANH cua mot vong chay — `#243` F1.
 *
 * ============================================================================================
 * CHIN LOAI MOC, VA HAI THU CO Y KHONG NAM TRONG DANH SACH NAY
 * ============================================================================================
 *
 * `#243` liet ke mot luong mau co ca `IN_TRANSIT` va `WAITING_RECEIVER`, va cung cau do noi ro
 * *"Exact event names may change after code review, but do not encode every customer-specific
 * process into one enormous lifecycle enum."* Hai cai bi loai, moi cai mot ly do khac nhau:
 *
 *   · `IN_TRANSIT` la mot KHOANG SUY RA duoc — no la phan giua `PICKUP_DEPARTURE` va
 *     `DELIVERY_ARRIVAL`. Ghi no thanh mot moc rieng khong them mot su that nao, va no tao ra mot
 *     cach thu hai de tra loi cung mot cau hoi: hai cach tra loi thi se co luc chung lech nhau.
 *
 *   · `WAITING_RECEIVER` la mot KHOANG THOI GIAN, khong phai mot diem. `#243` tu viet
 *     `WAITING_RECEIVER (0..N duration)`. Mot khoang keo dai nhieu ngay ma bi ep thanh mot moc
 *     tuc thoi thi cau hoi "dang cho bao lau roi" khong con cho nao de tra loi. No la mot thuc the
 *     rieng (`TransportDeliveryWaitingSession`, F3), mo boi chinh `DELIVERY_ARRIVAL`.
 *
 * ============================================================================================
 * DAY KHONG PHAI MOT MAY TRANG THAI THU HAI
 * ============================================================================================
 *
 * `TransportVehicleRun` giu nguyen bon trang thai cua Lane A (`PLANNED/ACTIVE/COMPLETED/
 * CANCELLED`) va khong duoc noi them mot gia tri nao. Danh sach duoi day la TU VUNG QUAN SAT:
 * moi hang la mot viec DA XAY RA, ghi them chu khong ghi de. Mot dong thoi gian doc duoc la mot
 * PHEP CHIEU tu chuoi quan sat do (`run-timeline.ts`), khong phai mot cot trang thai.
 */
export const RUN_CHECKPOINT_TYPES = [
  /** Dieu hanh giao viec. Moc DUY NHAT khong do lai xe ghi. */
  'ASSIGNED',
  /** Lai xe roi diem xuat phat. Tuong ung `STARTED` trong luong mau cua `#243`. */
  'DEPARTED',
  'PICKUP_ARRIVAL',
  'GATE_ENTRY',
  'LOADING',
  'PICKUP_DEPARTURE',
  /** Nut `Da den noi`. Moc nay MO mot phien cho (F3). */
  'DELIVERY_ARRIVAL',
  /** Nguoi nhan da nhan hang. Moc nay DONG phien cho. */
  'DELIVERY_ACCEPTED',
  'COMPLETED',
] as const;

export type RunCheckpointType = (typeof RUN_CHECKPOINT_TYPES)[number];

/**
 * MOT MOC DA GHI.
 *
 * `receivedAt` la gio cua MAY CHU va la gio duy nhat duoc dung de TINH TOAN. `capturedAt` la gio
 * may khach bao, giu lai de doi chieu chu khong de tinh: xem `run-timeline.ts` va bai `F7`
 * *"waiting duration cannot be shortened by editing client clock"*.
 */
export interface RunCheckpoint {
  readonly id: string;
  readonly type: RunCheckpointType;
  readonly runId: string;
  /** NULL o moc muc vong chay (`ASSIGNED`, `DEPARTED`, `COMPLETED`). */
  readonly legId: string | null;
  readonly recordedBy: string;
  readonly driverId: string | null;
  /** Ban dinh vi cua Lane B. NULL khi loai moc do khong doi vi tri. */
  readonly observationId: string | null;
  readonly clientEventId: string;
  readonly capturedAt: Date | null;
  readonly receivedAt: Date;
  readonly businessDate: BusinessDate;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** Lenh ghi mot moc. Danh tinh den tu PHIEN, khong tu than yeu cau. */
export interface RecordCheckpointCommand {
  readonly type: RunCheckpointType;
  readonly runId: string;
  readonly legId?: string;
  readonly authUserId: string;
  readonly observationId?: string;
  readonly clientEventId: string;
  readonly note?: string;
}
