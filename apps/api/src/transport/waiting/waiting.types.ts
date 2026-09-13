import type { BusinessDate } from '../business-date.js';

/**
 * PHIEN CHO NGUOI NHAN — `#279` O5, tiep tuc `#243` F3.
 *
 * ============================================================================================
 * VI SAO DAY LA MOT KHOANG, KHONG PHAI MOT MOC
 * ============================================================================================
 *
 * `checkpoint.types.ts` da loai `WAITING_RECEIVER` khoi chin loai moc va ghi ro ly do: mot khoang
 * keo dai nhieu ngay ma bi ep thanh mot diem tuc thoi thi cau hoi *"dang cho bao lau roi"* khong
 * con cho nao de tra loi. Tep nay la thuc the ma khoi chu thich do hen truoc.
 *
 * `control-tower.types.ts` doc lap noi cung dieu tu phia doi dien: cot `WAITING` cua bang dieu
 * hanh KHONG duoc suy tu moc, vi hai chang cung dung o `DELIVERY_ARRIVAL` thi mot chang co the
 * dang cho con chang kia thi khong. Phan biet duoc hai truong hop do la CA LY DO ton tai cua bang
 * nay.
 *
 * ============================================================================================
 * GIO MAY CHU LA GIO DUY NHAT — VA DO LA MOT TINH CHAT CAU TRUC
 * ============================================================================================
 *
 * `#279` O4: *"Do not let a client clock decide authoritative waiting duration."*
 *
 * Khong mot truong thoi gian nao o day nhan duoc tu than yeu cau. `startedAt` do dong ho may chu
 * dat luc mo phien; `endedAt` la `receivedAt` cua chinh moc `DELIVERY_ACCEPTED` da dong no — cung
 * mot dong ho, cung mot nguon. `waiting.schemas.ts` dung `.strict()` nen mot may khach gui
 * `startedAt` bi bao 400 chu khong bi bo qua im lang.
 *
 * Thoi luong thi KHONG duoc luu. No la mot PHEP TRU doc luc doc (`elapsedSecondsOf`). Mot cot
 * `durationSeconds` se la cau tra loi THU HAI cho cung mot cau hoi, va `#243` F3 da doi thoi luong
 * phai *"derived deterministically, not hand-edited as truth"* — mot cot sua duoc thi mot ngay nao
 * do se co nguoi sua no.
 */

/**
 * VI SAO LAI XE PHAI CHO — su that VAN HANH, khong phai mot muc gia.
 *
 * Danh sach nay khong quyet dinh mot dong tien nao. `#279` O6 tach bach: thoi luong cho la dau vao
 * van hanh, con so tien la mot con so NGUOI nhap va NGUOI duyet. Neu mot ngay co ai muon noi
 * `NO_UNLOADING_DOCK` dat hon `QUEUE_AHEAD`, do la mot chinh sach gia phai duoc ai do quyet — no
 * khong duoc lot vao day duoi dang mot thu tu ngam.
 */
export const WAITING_REASONS = [
  /** Nguoi nhan chua san sang nhan hang. Ly do thuong gap nhat cua ho so B. */
  'RECEIVER_NOT_READY',
  /** Khong con cua ha hang trong. */
  'NO_UNLOADING_DOCK',
  /** Con xe khac dang xep hang truoc. */
  'QUEUE_AHEAD',
  /** Chung tu chua khop — thieu phieu, sai so luong, cho xac nhan. */
  'DOCUMENT_ISSUE',
  'OTHER',
] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];

export const WAITING_SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type WaitingSessionStatus = (typeof WAITING_SESSION_STATUSES)[number];

/**
 * VI SAO MOT PHIEN CHO DA DONG LAI — HAI ma, va chung la HAI su that khac nhau.
 *
 * `RECEIVER_ACCEPTED` la duong BINH THUONG: nguoi nhan da nhan hang, va chinh moc
 * `DELIVERY_ACCEPTED` dong phien. Do la duong duy nhat lai xe co.
 *
 * `OPERATOR_CLOSED` la duong DON DEP: mot chuyen bi huy, mot lai xe quen bam, mot phien mo tu ba
 * hom truoc. Neu khong co duong nay thi mot phien mo nham se cho MAI MAI, va con so *"dang cho bao
 * lau"* cua bang dieu hanh se sai vinh vien ma khong ai sua duoc.
 *
 * Gop hai ma lam mot se lam bien mat dung cau hoi ma nguoi duyet phu cap phai hoi: *"phien nay
 * dong vi khach da nhan hang, hay vi van phong don rac?"* — va o duong thu hai, thoi luong khong
 * phai mot can cu tra tien.
 */
export const WAITING_CLOSE_REASONS = ['RECEIVER_ACCEPTED', 'OPERATOR_CLOSED'] as const;
export type WaitingCloseReason = (typeof WAITING_CLOSE_REASONS)[number];

/**
 * MOT PHIEN CHO.
 *
 * `legId` BAT BUOC — mot lan cho luon xay ra tai mot diem giao cu the. Mot phien muc vong chay
 * khong tra loi duoc *"cho o dau"*, va no se lam bang dieu hanh khong noi duoc chang nao dang ket.
 *
 * `arrivalCheckpointId` la NEO: phien cho phai moc vao dung lan `DELIVERY_ARRIVAL` da co chung cu
 * vi tri. Khong co neo do thi mot lai xe mo duoc phien cho cho mot noi ho chua den.
 */
export interface DeliveryWaitingSession {
  readonly id: string;
  readonly runId: string;
  readonly legId: string;
  readonly driverId: string | null;
  /** Moc `DELIVERY_ARRIVAL` mo duong cho phien nay. */
  readonly arrivalCheckpointId: string;
  /** Moc `DELIVERY_ACCEPTED` da dong phien. NULL khi phien con mo hoac do van phong dong. */
  readonly closingCheckpointId: string | null;
  readonly status: WaitingSessionStatus;
  readonly reason: WaitingReason;
  readonly closeReason: WaitingCloseReason | null;
  /** GIO MAY CHU. Khong nhan tu than yeu cau, khong sua duoc. */
  readonly startedAt: Date;
  /** GIO MAY CHU. NULL khi phien con mo. */
  readonly endedAt: Date | null;
  readonly startedBy: string;
  readonly endedBy: string | null;
  readonly startClientEventId: string;
  readonly note: string | null;
  readonly closeNote: string | null;
  readonly businessDate: BusinessDate;
  readonly createdAt: Date;
}

/**
 * THOI LUONG DA CHO — mot phep tru, khong mot cot.
 *
 * Voi phien con mo, moc tren la BAY GIO cua may chu. Nen mot man hinh hien "da cho 3 tieng 12
 * phut" khong doc mot con so nao do may khach tinh — no doc `startedAt` cua may chu va tru voi
 * `now` cua may chu.
 */
export const elapsedSecondsOf = (session: DeliveryWaitingSession, now: Date): number => {
  const end = session.endedAt ?? now;
  const seconds = Math.floor((end.getTime() - session.startedAt.getTime()) / 1000);
  // Khong bao gio am. Mot so am o day chi co the den tu mot dong ho bi keo lui giua hai lan doc,
  // va "da cho -4 giay" la mot cau vo nghia tren man hinh nguoi truc.
  return seconds < 0 ? 0 : seconds;
};

/** Lenh MO mot phien. Danh tinh tu PHIEN, gio tu MAY CHU — ca hai deu khong co mat o day. */
export interface StartWaitingCommand {
  readonly runId: string;
  readonly legId: string;
  readonly arrivalCheckpointId: string;
  readonly reason: WaitingReason;
  readonly clientEventId: string;
  readonly note?: string;
  readonly authUserId: string;
}

/** Lenh DON DEP cua van hanh. Khong phai duong cua lai xe — xem `WAITING_CLOSE_REASONS`. */
export interface CloseWaitingByOperatorCommand {
  readonly sessionId: string;
  readonly note: string;
  readonly authUserId: string;
}
