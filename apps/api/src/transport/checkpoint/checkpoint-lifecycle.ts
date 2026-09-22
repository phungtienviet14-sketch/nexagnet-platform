import type { RunLegKind } from '../movement/movement.types.js';
import type { CheckpointRecordReason } from './checkpoint-decisions.js';
import type { RunCheckpointType } from './checkpoint.types.js';

/**
 * QUY TAC THU TU cua moc van hanh — ham THUAN, khong cham mang, khong cham dia.
 *
 * ============================================================================================
 * TAI SAO DAY KHONG PHAI MOT MAY TRANG THAI
 * ============================================================================================
 *
 * `movement-lifecycle.ts` cua Lane A la mot may trang thai that: mot vong chay o DUNG MOT trang
 * thai, va moi buoc chuyen ghi de len cot cu. O day thi khac — mot vong chay co TAT CA cac moc
 * da xay ra cua no cung mot luc. Cai duoc kiem o day khong phai "duoc di tu X sang Y khong" ma la
 * "viec nay co the da xay ra chua, khi nhung viec kia da/chua xay ra".
 *
 * Hai thu do de bi gop lam mot, va gop thi hong theo mot kieu rat kho thay: mot may trang thai se
 * bat mot lai xe ghi `GATE_ENTRY` TRUOC roi moi duoc ghi `LOADING`, trong khi ngoai doi hai viec
 * do co the ve cung luc, va co bai khong he co cong.
 *
 * ============================================================================================
 * DANH SACH DIEU KIEN TRUOC CO Y NGAN
 * ============================================================================================
 *
 * Chi nhung canh ma thieu no thi so lieu SAI, chu khong phai moi canh ve duoc trong so do. Vi du
 * `GATE_ENTRY` KHONG doi `LOADING`, va `LOADING` KHONG doi `GATE_ENTRY`: nhieu bai khong co cong,
 * va nhieu bai can qua cong moi den can. Ep mot thu tu ma nghiep vu khong co se lam lai xe khong
 * ghi duoc moc that, roi ho bo qua luon buoc ghi — mat ca dong thoi gian de doi lay mot rang buoc
 * khong ai yeu cau.
 */

/** Moc thuoc MUC VONG CHAY — khong gan vao mot chang nao. */
const RUN_SCOPED: readonly RunCheckpointType[] = ['ASSIGNED', 'DEPARTED', 'COMPLETED'];

export const isRunScoped = (type: RunCheckpointType): boolean => RUN_SCOPED.includes(type);

/**
 * MOC NAO MANG NGHIA HANG HOA — `#332`.
 *
 * Mot chang `EMPTY` khong cho hang (bat bien cua `TransportRunLeg`: no khong mang don). Moc noi ve
 * viec lay/boc/giao hang ma neo vao chang do thi noi mot dieu khong the xay ra — va tu chinh no sinh
 * ra "hang tren thung" o mot chang rong, trong khi chang CO HANG that thi khong con moc nao.
 * Runtime 19/09/2026 da ghi dung hinh dang do.
 *
 * Mot `Record` chu khong mot danh sach: them mot loai moc moi ma quen phan loai la loi BIEN DICH.
 * Hom nay sau moc muc chang deu thuoc chuoi hang hoa; mot moc muc chang khong mang hang (vd "ve toi
 * bai") phai duoc khai `false` o day — co y, khong tu dong.
 */
const CARRIES_CARGO: Readonly<Record<RunCheckpointType, boolean>> = {
  ASSIGNED: false,
  DEPARTED: false,
  PICKUP_ARRIVAL: true,
  GATE_ENTRY: true,
  LOADING: true,
  PICKUP_DEPARTURE: true,
  DELIVERY_ARRIVAL: true,
  DELIVERY_ACCEPTED: true,
  COMPLETED: false,
};

export const carriesCargoMeaning = (type: RunCheckpointType): boolean => CARRIES_CARGO[type];

/**
 * Loai moc nay co duoc neo vao mot chang loai `kind` khong.
 *
 * Mot ham chung cho HAI ben: `evaluateCheckpoint` (cai tu choi) va `fieldActionsFor` (cai quyet
 * nut nao hien). Hai ban luat se lech nhau o lan sua thu ba — xem khoi chu thich cua
 * `field-actions.ts`.
 */
export const isCheckpointAllowedOnLeg = (type: RunCheckpointType, kind: RunLegKind): boolean =>
  kind === 'LOADED' || !carriesCargoMeaning(type);

/**
 * Dieu kien truc tiep truoc mot moc. `null` = khong doi gi.
 *
 * `LOADING` doi `PICKUP_ARRIVAL` chu khong doi `GATE_ENTRY` — xem khoi chu thich dau tep.
 */
const REQUIRES: Readonly<Record<RunCheckpointType, RunCheckpointType | null>> = {
  ASSIGNED: null,
  DEPARTED: 'ASSIGNED',
  PICKUP_ARRIVAL: null,
  GATE_ENTRY: 'PICKUP_ARRIVAL',
  LOADING: 'PICKUP_ARRIVAL',
  PICKUP_DEPARTURE: 'PICKUP_ARRIVAL',
  DELIVERY_ARRIVAL: 'PICKUP_DEPARTURE',
  DELIVERY_ACCEPTED: 'DELIVERY_ARRIVAL',
  COMPLETED: 'DEPARTED',
};

export const requiredPredecessor = (type: RunCheckpointType): RunCheckpointType | null =>
  REQUIRES[type];

/**
 * Moc chi duoc ghi MOT LAN tren mot pham vi.
 *
 * `LOADING` la ngoai le va do la mot su that nghiep vu: mot chang co the boc o hai kho, va moi lan
 * boc la mot phieu rieng. Ep no mot lan se lam phieu thu hai khong co cho de tro toi.
 */
const REPEATABLE: readonly RunCheckpointType[] = ['LOADING'];

export const isRepeatable = (type: RunCheckpointType): boolean => REPEATABLE.includes(type);

/**
 * CHINH SACH CHUNG CU VI TRI — loai moc nao bat buoc co ban dinh vi.
 *
 * NGUON, khong phai suy doan: `#232 D-08` chot rang giao hang bat buoc co vi tri hien tai, va
 * `#243` F3 goi `Da den noi` la mot hanh dong *"backed by accepted location proof when required by
 * B profile"*. Hai moc duoi day la dung hai moc do va khong hon.
 *
 * `#243` F5 noi tiep: *"Do not make every document universally mandatory; B/tenant policy should
 * decide required proof types where practical."* Nen day la MAC DINH cua ho so B, khong phai mot
 * hang so cua nen tang — `CheckpointPolicy` cho khach doi.
 */
export const DEFAULT_LOCATION_REQUIRED_TYPES: readonly RunCheckpointType[] = [
  'DELIVERY_ARRIVAL',
  'DELIVERY_ACCEPTED',
];

export interface CheckpointPolicy {
  readonly locationRequiredTypes: readonly RunCheckpointType[];
}

export const DEFAULT_CHECKPOINT_POLICY: CheckpointPolicy = {
  locationRequiredTypes: DEFAULT_LOCATION_REQUIRED_TYPES,
};

export interface CheckpointDecision {
  readonly allowed: boolean;
  readonly reason: CheckpointRecordReason;
  /** Moc con thieu, khi va chi khi `reason` la `CHECKPOINT_PREDECESSOR_MISSING`. */
  readonly requires?: RunCheckpointType;
}

const allow = (reason: CheckpointRecordReason): CheckpointDecision => ({ allowed: true, reason });
const deny = (
  reason: CheckpointRecordReason,
  requires?: RunCheckpointType,
): CheckpointDecision => ({
  allowed: false,
  reason,
  ...(requires ? { requires } : {}),
});

export interface CheckpointEvaluation {
  readonly type: RunCheckpointType;
  /** Vong chay da o `COMPLETED`/`CANCELLED` chua. */
  readonly runTerminal: boolean;
  /** Co kem `legId` khong. */
  readonly hasLeg: boolean;
  /**
   * LOAI cua chang duoc kem — `null` khi khong kem chang nao. BAT BUOC (`| null`, khong phai `?`):
   * mot ben goi quen dien se lam cong `#332` im lang cho qua.
   */
  readonly legKind: RunLegKind | null;
  /** Loai moc DA GHI tren dung pham vi dang xet (chang do, hoac muc vong chay). */
  readonly recordedTypes: readonly RunCheckpointType[];
  /** Co kem ban dinh vi khong. */
  readonly hasObservation: boolean;
  readonly policy: CheckpointPolicy;
}

/**
 * Mot moc co duoc ghi khong — tra ve LY DO, khong phai `boolean`.
 *
 * THU TU KIEM la mot phan cua hop dong. Pham vi truoc thu tu, thu tu truoc trung lap, trung lap
 * truoc vi tri: mot yeu cau sai ca pham vi lan vi tri phai bao loi pham vi, vi do la cai nguoi
 * goi phai sua truoc. Doi thu tu se cho ra mot ma DUNG VE KET QUA nhung SAI VE NGUYEN NHAN.
 */
export function evaluateCheckpoint(input: CheckpointEvaluation): CheckpointDecision {
  if (input.runTerminal) return deny('CHECKPOINT_RUN_TERMINAL');

  const runScoped = isRunScoped(input.type);
  if (runScoped && input.hasLeg) return deny('CHECKPOINT_LEG_NOT_APPLICABLE');
  if (!runScoped && !input.hasLeg) return deny('CHECKPOINT_LEG_REQUIRED');
  // Van la PHAM VI — chang nao duoc nhan moc nay — nen dung truoc thu tu (`#332`).
  if (input.legKind !== null && !isCheckpointAllowedOnLeg(input.type, input.legKind)) {
    return deny('CHECKPOINT_CARGO_ON_EMPTY_LEG');
  }

  const predecessor = requiredPredecessor(input.type);
  if (predecessor !== null && !input.recordedTypes.includes(predecessor)) {
    return deny('CHECKPOINT_PREDECESSOR_MISSING', predecessor);
  }

  if (!isRepeatable(input.type) && input.recordedTypes.includes(input.type)) {
    return deny('CHECKPOINT_ALREADY_RECORDED');
  }

  if (input.policy.locationRequiredTypes.includes(input.type) && !input.hasObservation) {
    return deny('CHECKPOINT_LOCATION_REQUIRED');
  }

  return allow('CHECKPOINT_RECORDED');
}
