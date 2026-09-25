import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';
import { TRANSPORT_PROOF_DECISIONS } from '../proof/proof-decisions.js';

/**
 * TU VUNG QUYET DINH cua QUAN TRI DIA DIEM VAN HANH (`#395`).
 *
 * TACH khoi `TRANSPORT_PLACE_DECISIONS` (`place.lookup`, tim dia diem cho Tao don) co chu dich: tim
 * la mot phep DOC hoi nha cung cap ben ngoai; quan tri la mot phep GHI doi bai xe cua khau lap ke
 * hoach va phan quyet hang rao cua ca lich su. Hai cau hoi, hai bo tu vung, hai chu so huu.
 *
 * MOT diem quyet dinh: `place.write` — "lan tao / sua / tat / bat / doi bai chinh nay co duoc phep
 * khong, va neu khong thi vi sao". `detail` KHONG mang toa do hay dia chi: ca hai la du lieu vi tri.
 *
 * `GEOFENCE_RADIUS_OUT_OF_RANGE` la ma DA CO cua `transport-proof`; nhan cua no lay NGUYEN tu bo do,
 * vi `defineDecisionVocabulary` ghi de nhan im lang — hai cau khac nhau cho mot ma se lam trace noi
 * cau nao tuy thu tu nap module.
 */
export const PLACE_WRITE_REASONS = [
  /** Thay doi hop le va da duoc ghi. */
  'PLACE_WRITE_ALLOWED',
  /** Doi/tat bai xe khi con viec dang mo, va nguoi dung DA xac nhan danh sach viec do. */
  'PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED',
  /** Trung ten (da chuan hoa) voi mot dia diem dang hieu luc khac. */
  'PLACE_NAME_TAKEN',
  /** Da co mot bai xe dang bat — DB chan bang `TransportGeofence_one_active_depot`. */
  'DEPOT_ALREADY_ACTIVE',
  /** Ma bai xe da dung — DB chan bang `TransportGeofence_depot_code_key`. */
  'DEPOT_CODE_TAKEN',
  /** Diem nam ngoai vung phuc vu. */
  'PLACE_OUTSIDE_SERVICE_AREA',
  'GEOFENCE_RADIUS_OUT_OF_RANGE',
  /** Ma so thue cua don vi moi da thuoc mot phap nhan khac. */
  'COUNTERPARTY_TAX_CODE_TAKEN',
  /** Doi/tat bai xe khi con vong xe, don dang mo — chua xac nhan. */
  'DEPOT_CHANGE_AFFECTS_OPEN_WORK',
  /** Tao/doi ten dia diem cua don vi khac doi quyen quan ly phap nhan. */
  'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE',
  /** Sua ten/trang thai qua duong cu mot dia diem dang duoc quan ly o Dia diem van hanh. */
  'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
] as const;
export type PlaceWriteReason = (typeof PLACE_WRITE_REASONS)[number];

export const TRANSPORT_PLACE_ADMIN_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-places-admin',
  points: ['place.write'],
  labels: {
    PLACE_WRITE_ALLOWED: 'Thay đổi địa điểm vận hành hợp lệ và đã được ghi',
    PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED:
      'Đổi bãi xe khi còn việc đang mở — người dùng đã xác nhận danh sách việc bị ảnh hưởng',
    PLACE_NAME_TAKEN: 'Tên địa điểm trùng với một địa điểm đang hoạt động khác',
    DEPOT_ALREADY_ACTIVE: 'Đã có một bãi xe đang dùng — chỉ một bãi được bật',
    DEPOT_CODE_TAKEN: 'Mã bãi xe đã được dùng',
    PLACE_OUTSIDE_SERVICE_AREA: 'Vị trí nằm ngoài vùng phục vụ',
    GEOFENCE_RADIUS_OUT_OF_RANGE: TRANSPORT_PROOF_DECISIONS.labels.GEOFENCE_RADIUS_OUT_OF_RANGE,
    COUNTERPARTY_TAX_CODE_TAKEN: 'Mã số thuế đã thuộc một đơn vị khác',
    DEPOT_CHANGE_AFFECTS_OPEN_WORK: 'Còn vòng xe hoặc đơn đang mở dùng bãi xe này — cần xác nhận',
    PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE:
      'Địa điểm của đơn vị khác cần thêm quyền quản lý khách hàng, đối tác',
    COUNTERPARTY_SITE_MANAGED_AS_PLACE: 'Điểm này đang được quản lý ở Địa điểm vận hành — sửa ở đó',
  } satisfies Record<PlaceWriteReason, string>,
});
