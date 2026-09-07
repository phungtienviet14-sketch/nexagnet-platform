import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua `transport-proof` — bam vi tri va chung cu van hanh.
 *
 * MOT DIEU PHAI DOC TRUOC KHI THEM MA VAO DAY (#232 D-02): khong mot ma nao trong tep nay duoc
 * phep tu sinh ra cong no, tru luong hay ket luan gian lan. Chung deu ket thuc o mot cho duy nhat
 * — mot dong trong danh sach de NGUOI xem lai. Vi vay bo ma duoi day tach lam hai loai rat khac
 * nhau, va khong duoc tron:
 *
 *   · `*_DENIED` / `*_REJECTED` — cong DONG. Yeu cau khong duoc ghi. Day la an toan, khong phai
 *     ket luan ve dong co cua ai;
 *   · `RISK_*` — yeu cau VAN DUOC GHI, kem mot co. He thong khong biet chuyen gi da xay ra; no
 *     chi biet phep do nay khong tu giai thich duoc.
 *
 * Gop hai loai lai la cach nhanh nhat de bien mot he bang chung thanh mot he ket toi.
 */

/* ------------------------------------------------------------------ *
 * tracking.session_open — TrackingService.openSession()
 * ------------------------------------------------------------------ */
export const TRACKING_SESSION_OPEN_REASONS = [
  'SESSION_OPENED',
  /** Da co dung phien nay dang mo cho dung chuyen nay — tra lai ban cu, khong mo them. */
  'SESSION_ALREADY_OPEN',
  /** Nguoi dang nhap khong noi duoc voi mot ho so lai xe nao. */
  'DRIVER_BINDING_MISSING',
  /** Chuyen khong ton tai. */
  'TRIP_NOT_FOUND',
  /**
   * Lai xe nay chua tung duoc phan cong vao chuyen do.
   *
   * Day la cong chan "lai xe tu chon mot chuyen bat ky". Danh tinh den tu PHIEN; chuyen den tu
   * than yeu cau; va chi phep giao nhau cua hai thu do moi mo duoc phien.
   */
  'DRIVER_NOT_ASSIGNED_TO_TRIP',
  /** Chuyen da o trang thai ket thuc — khong con gi de bam. */
  'TRIP_NOT_ACTIVE',
  /**
   * Lai xe dang co MOT phien khac mo tren mot chuyen khac.
   *
   * Mot nguoi lai mot xe tai mot thoi diem. Hai phien cung mo nghia la mot trong hai dang mo ta
   * mot thu khong co that, va he thong khong biet cai nao — nen no tu choi thay vi doan.
   */
  'DRIVER_HAS_ANOTHER_OPEN_SESSION',
  /** Ma cai dat ung dung nay da duoc gan cho mot lai xe KHAC. */
  'DEVICE_BOUND_TO_ANOTHER_DRIVER',
  /** Ma cai dat da bi thu hoi. */
  'DEVICE_REVOKED',
] as const;
export type TrackingSessionOpenReason = (typeof TRACKING_SESSION_OPEN_REASONS)[number];

/* ------------------------------------------------------------------ *
 * tracking.session_close — TrackingService.closeSession()
 * ------------------------------------------------------------------ */
export const TRACKING_SESSION_CLOSE_REASONS = [
  'SESSION_CLOSED',
  /** Phien da dong tu truoc — idempotent, khong nem. */
  'SESSION_ALREADY_CLOSED',
  'SESSION_NOT_FOUND',
  /** Phien do khong thuoc ve nguoi dang goi. */
  'SESSION_NOT_OWNED',
] as const;
export type TrackingSessionCloseReason = (typeof TRACKING_SESSION_CLOSE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * tracking.observation_ingest — TrackingService.ingest()
 * ------------------------------------------------------------------ */
export const TRACKING_INGEST_REASONS = [
  'OBSERVATION_RECORDED',
  /**
   * Dung `clientEventId` da co, va NOI DUNG y het — mang chap chon, hoac hang doi ngoai tuyen gui
   * lai. Tra lai ban cu, khong ghi them mot hang nao.
   */
  'OBSERVATION_REPLAYED',
  /**
   * Dung `clientEventId` nhung NOI DUNG KHAC. Day khong phai gui lai; day la mot khoa bi dung lai
   * cho mot su kien moi. Tu choi on ao: neu tra ban cu thi ban dinh vi moi bien mat khong dau vet.
   */
  'OBSERVATION_EVENT_ID_REUSED',
  'SESSION_NOT_FOUND',
  'SESSION_NOT_OWNED',
  /** Phien da dong — khong nhan them ban dinh vi. */
  'SESSION_NOT_ACTIVE',
  /** Toa do khong qua duoc kiem bien (`geo-point.ts`), ke ca truong hop (0,0). */
  'COORDINATE_REJECTED',
] as const;
export type TrackingIngestReason = (typeof TRACKING_INGEST_REASONS)[number];

/* ------------------------------------------------------------------ *
 * tracking.risk_assessed — TrackingService, sau khi mot ban dinh vi da duoc GHI
 * ------------------------------------------------------------------ */
export const TRACKING_RISK_REASONS = [
  /** Khong co gi dang de nguoi nhin. */
  'RISK_NONE',
  'RISK_ACCURACY_POOR',
  /** Ung dung khong gui truong sai so — cau hoi ve PHIEN BAN, khong ve bau troi. */
  'RISK_ACCURACY_UNKNOWN',
  /** Thiet bi tu bao ban dinh vi den tu nha cung cap gia lap. */
  'RISK_MOCK_LOCATION_REPORTED',
  /** Dong ho may khach lech qua nguong so voi may chu. GHI, khong tu choi. */
  'RISK_CLOCK_SKEW_EXCEEDED',
  'RISK_IMPLAUSIBLE_SPEED',
  'RISK_LARGE_TIME_GAP',
  'RISK_TIMESTAMP_NOT_ADVANCING',
  'RISK_OUTSIDE_OPERATING_AREA',
] as const;
export type TrackingRiskReason = (typeof TRACKING_RISK_REASONS)[number];

/* ------------------------------------------------------------------ *
 * geofence.register / geofence.evaluate
 * ------------------------------------------------------------------ */
export const GEOFENCE_REGISTER_REASONS = [
  'GEOFENCE_REGISTERED',
  'GEOFENCE_UPDATED',
  /** Ban kinh ngoai khoang cho phep cua chinh sach khach. */
  'GEOFENCE_RADIUS_OUT_OF_RANGE',
  'GEOFENCE_COORDINATE_REJECTED',
  /** `AD_HOC` phai khong co chu the; moi loai khac phai co. */
  'GEOFENCE_SUBJECT_SHAPE_INVALID',
  'GEOFENCE_NOT_FOUND',
] as const;
export type GeofenceRegisterReason = (typeof GEOFENCE_REGISTER_REASONS)[number];

export const GEOFENCE_EVALUATE_REASONS = [
  'GEOFENCE_INSIDE',
  'GEOFENCE_OUTSIDE',
  /**
   * Ban kinh sai so trum qua bien hang rao — hinh hoc KHONG du de noi.
   *
   * Day la ma quan trong nhat cua ca tep. Mot he thong tra ve hai gia tri se buoc phai chon bua
   * mot ben, va no se chon sai deu dan cho moi lan tin hieu kem — tuc dung luc nguoi ta can no
   * dung nhat.
   */
  'GEOFENCE_INDETERMINATE',
  /** Chua ai khai mot hang rao nao cho diem nay. Khong phai loi, va khong phai "o ngoai". */
  'GEOFENCE_NONE_CONFIGURED',
] as const;
export type GeofenceEvaluateReason = (typeof GEOFENCE_EVALUATE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * tracking.history_read — doc lich su toa do THO
 * ------------------------------------------------------------------ */
export const TRACKING_HISTORY_READ_REASONS = [
  'HISTORY_READ_GRANTED',
  /**
   * Vai nay khong duoc doc duong di chi tiet cua mot con nguoi.
   *
   * Ke toan can biet "co chung cu vi tri khong" va "co trong hang rao khong" — hai cau tra loi
   * TOM TAT. Ho khong can chuoi toa do tung phut cua mot nguoi lam cong, va cap no cho ho la mo
   * mot nang luc giam sat ma khong ai yeu cau.
   */
  'HISTORY_READ_DENIED_NEED_TO_KNOW',
] as const;
export type TrackingHistoryReadReason = (typeof TRACKING_HISTORY_READ_REASONS)[number];

/* ------------------------------------------------------------------ *
 * proof.record — OperationalProofService.record()
 * ------------------------------------------------------------------ */
export const PROOF_RECORD_REASONS = [
  'PROOF_RECORDED',
  /** Cung khoa su kien — mot lan bam bi gui lai. Tra ban cu, khong tao chung cu thu hai. */
  'PROOF_REPLAYED',
  'PROOF_DRIVER_BINDING_MISSING',
  'PROOF_TRIP_NOT_FOUND',
  'PROOF_DRIVER_NOT_ASSIGNED',
  /** Giao hang khong co anh. Ho so B (`#232 D-08`) bat buoc — tu choi, khong ghi. */
  'PROOF_PHOTO_REQUIRED',
  'PROOF_OBSERVATION_NOT_FOUND',
  /**
   * Ban dinh vi do thuoc phien cua NGUOI KHAC.
   *
   * Khong co cong nay thi mot lai xe tro duoc chung cu cua minh vao mot ban dinh vi cua dong
   * nghiep — tuc muon vi tri cua nguoi khac lam bang chung cho chinh minh.
   */
  'PROOF_OBSERVATION_NOT_OWNED',
  /** Ban dinh vi da duoc dung cho mot chung cu khac — chan dung lai vi tri cu cho lan giao sau. */
  'PROOF_OBSERVATION_ALREADY_USED',
  /**
   * Anh KHONG chup trong ung dung. Ban ghi VAN duoc nhan — day la `degraded`, khong phai `denied`.
   *
   * Doc cho dung: day la loi khai cua ung dung, khong phai mot su that may chu kiem duoc. Gia tri
   * cua no la ngan he thong LANG LE cham cung mot muc tin cay cho hai duong khac nhau.
   */
  'PROOF_PHOTO_NOT_LIVE_CAMERA',
] as const;
export type ProofRecordReason = (typeof PROOF_RECORD_REASONS)[number];

export type TransportProofDecisionReason =
  | ProofRecordReason
  | TrackingSessionOpenReason
  | TrackingSessionCloseReason
  | TrackingIngestReason
  | TrackingRiskReason
  | GeofenceRegisterReason
  | GeofenceEvaluateReason
  | TrackingHistoryReadReason;

export const TRANSPORT_PROOF_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-proof',
  points: [
    'tracking.session_open',
    'tracking.session_close',
    'tracking.observation_ingest',
    'tracking.risk_assessed',
    'tracking.history_read',
    'geofence.register',
    'geofence.evaluate',
    'proof.record',
  ],
  labels: {
    SESSION_OPENED: 'Đã mở phiên bám vị trí',
    SESSION_ALREADY_OPEN: 'Phiên này đã mở sẵn, không mở thêm',
    DRIVER_BINDING_MISSING: 'Tài khoản đăng nhập chưa nối với hồ sơ lái xe nào',
    TRIP_NOT_FOUND: 'Không tìm thấy chuyến',
    DRIVER_NOT_ASSIGNED_TO_TRIP: 'Lái xe chưa từng được phân công vào chuyến này',
    TRIP_NOT_ACTIVE: 'Chuyến đã kết thúc — không còn gì để bám',
    DRIVER_HAS_ANOTHER_OPEN_SESSION: 'Lái xe đang có một phiên khác mở trên chuyến khác',
    DEVICE_BOUND_TO_ANOTHER_DRIVER: 'Mã cài đặt ứng dụng này đã gắn với một lái xe khác',
    DEVICE_REVOKED: 'Mã cài đặt ứng dụng đã bị thu hồi',

    SESSION_CLOSED: 'Đã đóng phiên bám vị trí',
    SESSION_ALREADY_CLOSED: 'Phiên đã đóng từ trước',
    SESSION_NOT_FOUND: 'Không tìm thấy phiên',
    SESSION_NOT_OWNED: 'Phiên đó không thuộc về người đang gọi',

    OBSERVATION_RECORDED: 'Đã ghi một bản định vị',
    OBSERVATION_REPLAYED: 'Gửi lại đúng bản cũ — không ghi thêm hàng nào',
    OBSERVATION_EVENT_ID_REUSED: 'Một mã sự kiện được dùng lại cho nội dung khác',
    SESSION_NOT_ACTIVE: 'Phiên đã đóng — không nhận thêm bản định vị',
    COORDINATE_REJECTED: 'Toạ độ không qua được kiểm biên',

    RISK_NONE: 'Không có gì đáng để người nhìn',
    RISK_ACCURACY_POOR: 'Sai số định vị quá lớn để trả lời câu đang hỏi',
    RISK_ACCURACY_UNKNOWN: 'Ứng dụng không gửi sai số định vị',
    RISK_MOCK_LOCATION_REPORTED: 'Thiết bị tự báo vị trí đến từ nhà cung cấp giả lập',
    RISK_CLOCK_SKEW_EXCEEDED: 'Đồng hồ máy khách lệch quá ngưỡng so với máy chủ',
    RISK_IMPLAUSIBLE_SPEED: 'Dịch chuyển nhanh hơn mức một chiếc xe làm được',
    RISK_LARGE_TIME_GAP: 'Chuỗi bản định vị đứt một khoảng dài',
    RISK_TIMESTAMP_NOT_ADVANCING: 'Dấu thời gian không tiến lên so với bản trước',
    RISK_OUTSIDE_OPERATING_AREA: 'Toạ độ nằm ngoài khung hoạt động thô',

    GEOFENCE_REGISTERED: 'Đã tạo hàng rào địa lý',
    GEOFENCE_UPDATED: 'Đã sửa hàng rào địa lý',
    GEOFENCE_RADIUS_OUT_OF_RANGE: 'Bán kính nằm ngoài khoảng cho phép',
    GEOFENCE_COORDINATE_REJECTED: 'Toạ độ tâm không qua được kiểm biên',
    GEOFENCE_SUBJECT_SHAPE_INVALID: 'Hình dạng chủ thể của hàng rào không hợp lệ',
    GEOFENCE_NOT_FOUND: 'Không tìm thấy hàng rào',

    GEOFENCE_INSIDE: 'Nằm chắc chắn trong hàng rào',
    GEOFENCE_OUTSIDE: 'Nằm chắc chắn ngoài hàng rào',
    GEOFENCE_INDETERMINATE: 'Sai số trùm qua biên — hình học không đủ để kết luận',
    GEOFENCE_NONE_CONFIGURED: 'Chưa khai hàng rào nào cho điểm này',

    PROOF_RECORDED: 'Đã ghi một chứng cứ vận hành',
    PROOF_REPLAYED: 'Gửi lại đúng một lần bấm — trả bản cũ, không tạo chứng cứ thứ hai',
    PROOF_DRIVER_BINDING_MISSING: 'Tài khoản đăng nhập chưa nối với hồ sơ lái xe nào',
    PROOF_TRIP_NOT_FOUND: 'Không tìm thấy chuyến',
    PROOF_DRIVER_NOT_ASSIGNED: 'Lái xe chưa từng được phân công vào chuyến này',
    PROOF_PHOTO_REQUIRED: 'Giao hàng bắt buộc có ít nhất một tấm ảnh',
    PROOF_OBSERVATION_NOT_FOUND: 'Không tìm thấy bản định vị cho chứng cứ này',
    PROOF_OBSERVATION_NOT_OWNED: 'Bản định vị đó thuộc phiên của người khác',
    PROOF_OBSERVATION_ALREADY_USED: 'Bản định vị đó đã được dùng cho một chứng cứ khác',
    PROOF_PHOTO_NOT_LIVE_CAMERA:
      'Ảnh không chụp trong ứng dụng — vẫn nhận, nhưng không cùng mức tin cậy',

    HISTORY_READ_GRANTED: 'Được đọc lịch sử toạ độ thô',
    HISTORY_READ_DENIED_NEED_TO_KNOW: 'Vai này chỉ được xem tóm tắt, không xem đường đi chi tiết',
  } satisfies Record<TransportProofDecisionReason, string>,
});
