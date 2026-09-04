import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua `transport-asset-compliance`.
 *
 * Bo RIENG, cung ly le voi `transport-fuel`: mot khach van tai co the bat `transport-core` ma tat
 * capability nay, va mot bang loc trace hua co diem "trang thai hieu luc cua xe" trong khi khong
 * co du lieu bao duong nao la mot loi doc duoc.
 *
 * KHONG MOT NOI DUNG NHAY CAM NAO di vao day. `detail` cua cac diem duoi chi mang ma dinh danh va
 * con so dem duoc — khong so hieu giay to, khong so don bao hiem, khong ten nguoi. Issue #88 ghi
 * ro "do not place sensitive payroll/document payloads in telemetry".
 */

/* ------------------------------------------------------------------ *
 * maintenance.work_order_open — mo mot lenh sua
 * ------------------------------------------------------------------ */
export const MAINTENANCE_WORK_ORDER_OPEN_REASONS = [
  'MAINTENANCE_WORK_ORDER_OPENED',
  /** Ke hoach do da co mot lenh dang mo — unique mot phan cua DB tu choi ban thu hai. */
  'MAINTENANCE_WORK_ORDER_ALREADY_OPEN',
  'MAINTENANCE_VEHICLE_UNKNOWN',
  'MAINTENANCE_PLAN_UNKNOWN',
  /**
   * Ke hoach co that, xe co that, nhung ke hoach do THUOC VE mot chiec xe khac.
   *
   * Ma RIENG chu khong gop vao `MAINTENANCE_PLAN_UNKNOWN`: hai duong tu choi nay noi hai viec
   * khac han cho nguoi truc — "ban go nham ma ke hoach" so voi "ban dang mo lenh cho nham xe".
   */
  'MAINTENANCE_PLAN_VEHICLE_MISMATCH',
] as const;
export type MaintenanceWorkOrderOpenReason = (typeof MAINTENANCE_WORK_ORDER_OPEN_REASONS)[number];

/* ------------------------------------------------------------------ *
 * maintenance.work_order_close — dong hoac huy mot lenh sua
 * ------------------------------------------------------------------ */
export const MAINTENANCE_WORK_ORDER_CLOSE_REASONS = [
  'MAINTENANCE_WORK_ORDER_COMPLETED',
  'MAINTENANCE_WORK_ORDER_CANCELLED',
  'MAINTENANCE_WORK_ORDER_NOT_OPEN',
  'MAINTENANCE_ODO_REGRESSION',
] as const;
export type MaintenanceWorkOrderCloseReason = (typeof MAINTENANCE_WORK_ORDER_CLOSE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * compliance.document_register — ghi mot ban giay to
 * ------------------------------------------------------------------ */
export const COMPLIANCE_DOCUMENT_REGISTER_REASONS = [
  'COMPLIANCE_DOCUMENT_REGISTERED',
  'COMPLIANCE_SUBJECT_UNKNOWN',
  'COMPLIANCE_SUBJECT_SHAPE_INVALID',
  'COMPLIANCE_VALIDITY_RANGE_INVALID',
] as const;
export type ComplianceDocumentRegisterReason =
  (typeof COMPLIANCE_DOCUMENT_REGISTER_REASONS)[number];

/* ------------------------------------------------------------------ *
 * fleet.effective_vehicle_state — phep hop thanh cua T1 §18.2
 * ------------------------------------------------------------------ */
export const EFFECTIVE_VEHICLE_STATE_DECISION_REASONS = [
  'VEHICLE_UNDER_MAINTENANCE_LOCK',
  'VEHICLE_ON_ACTIVE_TRIP',
  'VEHICLE_IDLE',
  /** Acceptance 9 — bao duong VA chuyen dang chay cung dung. Bao duong thang, mau thuan duoc phat. */
  'VEHICLE_MAINTENANCE_TRIP_CONFLICT',
] as const;
export type EffectiveVehicleStateDecisionReason =
  (typeof EFFECTIVE_VEHICLE_STATE_DECISION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * alerts.operational_feed — bang canh bao gom chung
 * ------------------------------------------------------------------ */
export const OPERATIONAL_ALERTS_REASONS = [
  'OPERATIONAL_ALERTS_COMPILED',
  /**
   * Mot NGUON canh bao vang mat vi khach tat capability so huu no.
   *
   * Phat ra thay vi im lang: mot bang canh bao THIEU muc "tieu hao dau bat thuong" trong khi
   * khong ai biet la no bi tat trong se giong het mot bang khong co canh bao nao.
   */
  'OPERATIONAL_ALERTS_SOURCE_UNAVAILABLE',
] as const;
export type OperationalAlertsReason = (typeof OPERATIONAL_ALERTS_REASONS)[number];

export type TransportAssetComplianceDecisionReason =
  | MaintenanceWorkOrderOpenReason
  | MaintenanceWorkOrderCloseReason
  | ComplianceDocumentRegisterReason
  | EffectiveVehicleStateDecisionReason
  | OperationalAlertsReason;

export const TRANSPORT_ASSET_COMPLIANCE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-asset-compliance',
  points: [
    'maintenance.work_order_open',
    'maintenance.work_order_close',
    'compliance.document_register',
    'fleet.effective_vehicle_state',
    'alerts.operational_feed',
  ],
  labels: {
    MAINTENANCE_WORK_ORDER_OPENED: 'Đã mở lệnh sửa và khoá xe khỏi đội hình',
    MAINTENANCE_WORK_ORDER_ALREADY_OPEN: 'Kế hoạch này đã có một lệnh sửa đang mở',
    MAINTENANCE_VEHICLE_UNKNOWN: 'Không tìm thấy xe trong đội xe',
    MAINTENANCE_PLAN_UNKNOWN: 'Không tìm thấy kế hoạch bảo dưỡng',
    MAINTENANCE_PLAN_VEHICLE_MISMATCH: 'Kế hoạch bảo dưỡng này thuộc về một xe khác',

    MAINTENANCE_WORK_ORDER_COMPLETED: 'Đã đóng lệnh sửa; mốc chu kỳ tính lại từ đây',
    MAINTENANCE_WORK_ORDER_CANCELLED: 'Đã huỷ lệnh sửa mở nhầm, giữ lại dấu vết',
    MAINTENANCE_WORK_ORDER_NOT_OPEN: 'Lệnh sửa không còn mở nên không đóng/huỷ được',
    MAINTENANCE_ODO_REGRESSION: 'Số odo lúc đóng nhỏ hơn lúc mở',

    COMPLIANCE_DOCUMENT_REGISTERED: 'Đã ghi nhận một bản giấy tờ còn hiệu lực',
    COMPLIANCE_SUBJECT_UNKNOWN: 'Chủ thể của giấy tờ không tồn tại',
    COMPLIANCE_SUBJECT_SHAPE_INVALID: 'Giấy tờ công ty không được gắn vào xe hay người',
    COMPLIANCE_VALIDITY_RANGE_INVALID: 'Kỳ hiệu lực của giấy tờ không hợp lệ',

    VEHICLE_UNDER_MAINTENANCE_LOCK: 'Xe đang có lệnh sửa mở nên không nhận chuyến',
    VEHICLE_ON_ACTIVE_TRIP: 'Xe đang chạy một chuyến IN_TRANSIT được phân công',
    VEHICLE_IDLE: 'Xe rảnh — không lệnh sửa, không chuyến đang chạy',
    VEHICLE_MAINTENANCE_TRIP_CONFLICT:
      'Xe vừa đang sửa vừa đang chạy chuyến — mâu thuẫn vận hành cần người xử lý',

    OPERATIONAL_ALERTS_COMPILED: 'Đã tổng hợp bảng cảnh báo vận hành',
    OPERATIONAL_ALERTS_SOURCE_UNAVAILABLE:
      'Một nguồn cảnh báo vắng mặt vì capability sở hữu nó đang tắt',
  } satisfies Record<TransportAssetComplianceDecisionReason, string>,
});
