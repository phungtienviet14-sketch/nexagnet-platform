import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua THAP DIEU HANH.
 *
 * Bo RIENG khoi `movement-decisions.ts` du hai bo cung `owner: 'transport-core'`. Ly do la doc
 * duoc chu khong phai hinh thuc: `movement.*` tra loi "vi sao mot vong chay doi trang thai", con
 * `control_tower.*` tra loi "vi sao bang hom nay thieu mot muc". Gop chung se lam bo loc trace cua
 * nguoi truc hien ra ca bay diem vong doi ma ho khong hoi.
 *
 * KHONG NOI DUNG NHAY CAM. `detail` chi mang so dem va ma nguon — khong bien so, khong ten lai xe,
 * khong so tien. Cung luat da ghi o `asset-compliance-decisions.ts`.
 */

/* ------------------------------------------------------------------ *
 * control_tower.compile — dung mot lan doc bang
 * ------------------------------------------------------------------ */
export const CONTROL_TOWER_COMPILE_REASONS = [
  'CONTROL_TOWER_COMPILED',
  /**
   * Mot NGUON vang mat vi capability so huu no dang tat.
   *
   * Phat ra thay vi im lang, cung ly le voi `OPERATIONAL_ALERTS_SOURCE_UNAVAILABLE`: mot hang viec
   * KHONG co dong "phieu dau cho xac thuc" doc giong het mot ngay khong con phieu nao phai duyet.
   */
  'CONTROL_TOWER_SOURCE_UNAVAILABLE',
  /**
   * Mot NGUON co mat nhung tra ve loi.
   *
   * Tach khoi ma tren: "khach tat nghiep vu nay" va "nghiep vu nay dang hong" la hai tinh huong
   * doi hai hanh dong khac han cua nguoi truc. Bang van dung duoc — no chi mat mot muc — nen day
   * la `degraded`, khong phai mot lan hong ca lan doc.
   */
  'CONTROL_TOWER_SOURCE_FAILED',
] as const;
export type ControlTowerCompileReason = (typeof CONTROL_TOWER_COMPILE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * control_tower.board_projection — chieu vong chay len bang
 * ------------------------------------------------------------------ */
export const CONTROL_TOWER_BOARD_REASONS = [
  'BOARD_PROJECTED_FROM_RUN_STATUS',
  /**
   * Bon cot cua Lane F van rong vi chua co mo hinh checkpoint.
   *
   * Ghi lai o moi lan doc, khong phai mot lan luc khoi dong: khi Lane F vao `main` va ma nay NGUNG
   * xuat hien, do la bang chung doc duoc rang bang da chuyen sang nguon that.
   */
  'BOARD_CHECKPOINT_COLUMNS_UNAVAILABLE',
] as const;
export type ControlTowerBoardReason = (typeof CONTROL_TOWER_BOARD_REASONS)[number];

export type ControlTowerDecisionReason = ControlTowerCompileReason | ControlTowerBoardReason;

export const CONTROL_TOWER_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: ['control_tower.compile', 'control_tower.board_projection'],
  labels: {
    CONTROL_TOWER_COMPILED: 'Đã dựng xong bảng điều hành từ bản ghi nguồn',
    CONTROL_TOWER_SOURCE_UNAVAILABLE:
      'Một nguồn của bảng vắng mặt vì capability sở hữu nó đang tắt',
    CONTROL_TOWER_SOURCE_FAILED: 'Một nguồn của bảng có bật nhưng đọc lỗi — bảng thiếu mục đó',
    BOARD_PROJECTED_FROM_RUN_STATUS:
      'Bảng được chiếu từ trạng thái vòng chạy, không phải một vòng đời thứ hai',
    BOARD_CHECKPOINT_COLUMNS_UNAVAILABLE:
      'Bốn cột lấy/xếp hàng/đã đến/chờ nhận còn rỗng vì chưa có mô hình checkpoint',
  } satisfies Record<ControlTowerDecisionReason, string>,
});
