'use client';

import { Panel, PlannedSectionState } from '../components/SectionState';
import type { B2bSection } from '../navigation';

/**
 * RANH GIOI TRANG cho muc da co cho trong dieu huong nhung chua co nghiep vu trong ban nay.
 *
 * Trang nay CO Y khong goi mot API nao. Do la diem khac biet giua mot ranh gioi va mot cho trong:
 * no khong "dang tai mai", khong bao loi ket noi, va khong bay ra mot con so minh hoa nao. No noi
 * dung mot cau — muc nay chua mo — roi noi cho khach biet ho van lam duoc viec do o dau.
 *
 * Issue #107 §3 va §10: U-UI0 dung o vo, dieu huong, ranh gioi trang va trang thai. Cac muc o day
 * (dai ly, cham soc, chien dich, canh bao, nhat ky) thuoc cac moc sau.
 */

const DEFAULT_PLANNED_DETAIL =
  'Mục này đã có chỗ trong điều hướng nhưng nghiệp vụ được mở ở bản kế tiếp. ' +
  'Chúng tôi không hiển thị số liệu minh hoạ để tránh hiểu nhầm là đã chạy.';

/**
 * Cau giai thich RIENG cho tung muc — noi ro hom nay khach lam viec do o dau.
 *
 * Mot cau chung chung ("sap ra mat") bo mac nguoi dung giua chung: ho van co viec do phai lam hom
 * nay, va he thong van co cho de lam.
 */
const PLANNED_DETAIL: Readonly<Record<string, string>> = {
  dealers:
    'Danh sách đại lý, cộng tác viên và bản đồ nhóm hiện được quản lý trong trang quản trị hệ thống. ' +
    'Màn hình dành riêng cho người bán hàng được mở ở bản kế tiếp.',
  'customer-care':
    'Việc chăm sóc sau bán chưa được tách thành hàng việc riêng trong bản này. ' +
    'Tin nhắn chăm sóc vẫn đi qua mục Hội thoại như bình thường.',
  campaigns:
    'Chiến dịch nhắn tin hiện được soạn và duyệt trong trang quản trị hệ thống. ' +
    'Lịch gửi và kết quả từng đợt sẽ có màn hình riêng ở bản kế tiếp.',
  alerts:
    'Cảnh báo hiện được gửi tới người phụ trách qua kênh thông báo đã cấu hình. ' +
    'Bảng cảnh báo tập trung được mở ở bản kế tiếp.',
  'activity-log':
    'Nhật ký thay đổi đang được ghi đầy đủ và xem được trong trang quản trị hệ thống. ' +
    'Bản dành cho người dùng nghiệp vụ được mở ở bản kế tiếp.',
};

export function PlannedView({ section }: { section: B2bSection }) {
  return (
    <Panel title={section.label} description={section.summary}>
      <PlannedSectionState
        label={section.label}
        detail={PLANNED_DETAIL[section.id] ?? DEFAULT_PLANNED_DETAIL}
      />
      <a className="b2b-link" href="/settings">
        Xem cấu hình liên quan trong trang quản trị →
      </a>
    </Panel>
  );
}
