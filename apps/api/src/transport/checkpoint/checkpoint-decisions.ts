import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * checkpoint.record -- CheckpointService.record()
 * ------------------------------------------------------------------ */
export const CHECKPOINT_RECORD_REASONS = [
  'CHECKPOINT_RECORDED',
  /**
   * Gui lai DUNG lenh cu — tra ve chinh moc da ghi, khong ghi ban thu hai.
   *
   * Day la ma tra loi cho bai `F7` *"replayed event cannot duplicate checkpoint/business
   * transition"*. No la mot ket qua CHO PHEP chu khong phai mot loi: mang di dong mat song giua
   * luc gui va luc nhan la chuyen thuong ngay, va ung dung lai xe phai gui lai duoc.
   */
  'CHECKPOINT_REPLAYED',
  'CHECKPOINT_DRIVER_BINDING_MISSING',
  'CHECKPOINT_RUN_NOT_FOUND',
  /**
   * Lai xe khong cam vong chay nay. Bai `F7` *"Driver A cannot submit/read Driver B checkpoint"*.
   * Cong THAT nam o day chu khong o giao dien.
   */
  'CHECKPOINT_DRIVER_NOT_ASSIGNED',
  'CHECKPOINT_RUN_TERMINAL',
  'CHECKPOINT_LEG_NOT_FOUND',
  /** Chang do thuoc mot vong chay khac — mot cach muon chang cua nguoi khac. */
  'CHECKPOINT_LEG_NOT_IN_RUN',
  /** Loai moc nay noi ve mot chang cu the nhung yeu cau khong kem chang nao. */
  'CHECKPOINT_LEG_REQUIRED',
  /** Loai moc muc vong chay khong duoc gan vao mot chang. */
  'CHECKPOINT_LEG_NOT_APPLICABLE',
  /**
   * Thu tu nghiep vu: khong roi diem lay hang truoc khi den do. Xem `checkpoint-lifecycle.ts` —
   * moi canh thieu la MOT ma rieng, khong gop thanh mot `boolean`.
   */
  'CHECKPOINT_PREDECESSOR_MISSING',
  /** Da co dung loai moc do tren dung pham vi do. Mot lan den noi thi chi den mot lan. */
  'CHECKPOINT_ALREADY_RECORDED',
  'CHECKPOINT_LOCATION_REQUIRED',
  'CHECKPOINT_OBSERVATION_NOT_FOUND',
  /** Ban dinh vi khong thuoc ve lai xe dang ghi moc — muon vi tri nguoi khac lam bang chung. */
  'CHECKPOINT_OBSERVATION_NOT_OWNED',
  'CHECKPOINT_OBSERVATION_ALREADY_USED',
] as const;
export type CheckpointRecordReason = (typeof CHECKPOINT_RECORD_REASONS)[number];

export type TransportCheckpointDecisionReason = CheckpointRecordReason;

export const TRANSPORT_CHECKPOINT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-checkpoint',
  points: ['checkpoint.record'],
  labels: {
    CHECKPOINT_RECORDED: 'Da ghi moc van hanh',
    CHECKPOINT_REPLAYED: 'Lenh gui lai — tra ve moc da ghi, khong ghi ban thu hai',
    CHECKPOINT_DRIVER_BINDING_MISSING: 'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
    CHECKPOINT_RUN_NOT_FOUND: 'Khong tim thay vong chay',
    CHECKPOINT_DRIVER_NOT_ASSIGNED: 'Lai xe chua tung duoc phan cong vao vong chay nay',
    CHECKPOINT_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong ghi them moc duoc',
    CHECKPOINT_LEG_NOT_FOUND: 'Khong tim thay chang',
    CHECKPOINT_LEG_NOT_IN_RUN: 'Chang do khong thuoc vong chay nay',
    CHECKPOINT_LEG_REQUIRED: 'Loai moc nay phai gan vao mot chang cu the',
    CHECKPOINT_LEG_NOT_APPLICABLE: 'Loai moc nay thuoc muc vong chay, khong gan vao chang',
    CHECKPOINT_PREDECESSOR_MISSING: 'Thieu moc dung truoc trong quy trinh',
    CHECKPOINT_ALREADY_RECORDED: 'Moc nay da duoc ghi tu truoc',
    CHECKPOINT_LOCATION_REQUIRED: 'Loai moc nay bat buoc co vi tri hien tai',
    CHECKPOINT_OBSERVATION_NOT_FOUND: 'Khong tim thay ban dinh vi cho moc nay',
    CHECKPOINT_OBSERVATION_NOT_OWNED: 'Ban dinh vi do khong thuoc ve ban',
    CHECKPOINT_OBSERVATION_ALREADY_USED: 'Ban dinh vi do da duoc dung cho mot moc khac',
  } satisfies Record<TransportCheckpointDecisionReason, string>,
});
