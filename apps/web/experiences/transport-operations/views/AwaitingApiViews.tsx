'use client';

import { gapsForSection } from '../api-gaps';
import { PageHeader } from '../components/primitives';
import { AwaitingApiState } from '../components/SectionState';
import { findSection, type TransportSectionId } from '../navigation';

/**
 * Nhung muc CO trong hop dong kien truc nhung CHUA co duong du lieu.
 *
 * Hai loai khac nhau, va tep nay giu ca hai dung ban chat cua chung:
 *
 *   1. **Quyet toan / AR-AP / Bien truc tiep / Xuat du lieu** — `TX-05` DA CHAY o may chu nhung
 *      `transport-settlement.module.ts` khong khai mot controller nao. Khach da bat nghiep vu thi
 *      muc VAN hien, va noi that la chua lay ra duoc — an di se lam khach tuong ho chua mua.
 *   2. **Bao duong & giay to / Luong** — `TX-06`/`TX-07` DA vao `main` (PR #152) va DA co 25 route
 *      HTTP. Dieu huong khong con an hai muc nay: chung hien theo dung nang luc khach bat
 *      (`transport-asset-compliance` / `transport-workforce`). Nhung hai component o day VAN chua
 *      goi endpoint nao — noi chung vao read model that la viec cua T7D (#170). Cho den luc do
 *      chung noi that rang chua noi, thay vi bay mot bang rong hay mot con so bia.
 *
 * Khong tep nao trong day goi mot endpoint nao. Do la co y, va man hinh NOI RA dieu do.
 */

function AwaitingSection({
  section,
  designNote,
}: {
  readonly section: TransportSectionId;
  /** Hinh dang man hinh se co khi duong du lieu mo — de nguoi review doi chieu voi T6. */
  readonly designNote: readonly string[];
}) {
  const definition = findSection(section);
  const title = definition?.label ?? section;
  return (
    <>
      <PageHeader title={title} summary={definition?.summary} />
      <AwaitingApiState title={title} gaps={gapsForSection(section)} />
      <section className="tx-panel tx-panel--muted" aria-label={`Thiết kế chờ nối: ${title}`}>
        <h2>Sẽ hiện gì khi có đường dữ liệu</h2>
        <ul className="tx-designnote">
          {designNote.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function SettlementView() {
  return (
    <AwaitingSection
      section="settlement"
      designNote={[
        'Năm dòng tiền giữ RIÊNG, không gộp: khách hàng · nhà xe · nguồn đơn · cây xăng · lái xe.',
        'Khoá phân biệt hai dòng đối tác là VAI, không phải partner — một đối tác có thể vừa là nhà xe vừa là nguồn đơn.',
        'Số dư một chứng từ đọc qua chuỗi chứng từ (gốc + các bản điều chỉnh), không đọc trên bản gốc.',
        'Đối tác hai chiều hiển thị cả hai phía và một số ròng CHỈ để xem — không bù trừ.',
        'Cảnh báo hạn mức tín dụng theo điều khoản của từng khách hàng.',
      ]}
    />
  );
}

export function MarginView() {
  return (
    <AwaitingSection
      section="margin"
      designNote={[
        'Biên trực tiếp = doanh thu − chi phí trực tiếp − hoa hồng, theo từng chuyến.',
        'Câu "Chưa gồm chi phí cố định" đi kèm mọi con số và không được bỏ.',
        'Không gọi con số này là "lợi nhuận" ở bất kỳ nhãn nào.',
        'Chuyến thuê ngoài và chuyến xe nhà tính khác nhau, nên tách nhóm khi tổng hợp.',
      ]}
    />
  );
}

export function ArApView() {
  return (
    <AwaitingSection
      section="ar-ap"
      designNote={[
        'Tuổi nợ theo bốn khoảng: trong hạn · 1–30 · 31–60 · trên 60 ngày.',
        'Phải trả hiển thị số DƯƠNG cho người đọc, dù sổ ghi số âm.',
        'Nhóm theo đối tác và theo vai, không gộp một đối tác thành một dòng.',
      ]}
    />
  );
}

export function ExportsView() {
  return (
    <AwaitingSection
      section="exports"
      designNote={[
        'Kết xuất sổ quỹ, chi phí chuyến và đối soát nhiên liệu theo kỳ.',
        'Mỗi lần kết xuất ghi lại ai xuất và xuất khoảng nào, để đối chiếu ngoài hệ thống có dấu vết.',
        'Chưa có endpoint kết xuất nào ở máy chủ, kể cả cho các nghiệp vụ đã chạy.',
      ]}
    />
  );
}

/**
 * `TX-06`. Muc nay hien khi khach bat `transport-asset-compliance`. May chu DA co read model va
 * route (`GET /transport/compliance/alerts`, `/transport/maintenance/due`, `/transport/alerts`);
 * viec con lai la NOI vao do o T7D (#170) — va khi noi thi doc thang read model CUA MAY CHU,
 * KHONG dung lai quyet dinh tuan thu trong TypeScript.
 */
export function MaintenanceComplianceView() {
  return (
    <AwaitingSection
      section="maintenance"
      designNote={[
        'Bảo dưỡng đến hạn, lệnh sửa chữa và lịch sử dịch vụ theo từng xe.',
        'Giấy tờ sắp hết hạn và đã hết hạn, đọc từ read model của máy chủ.',
        'Trạng thái xe HIỆU LỰC do máy chủ quyết định — màn hình không tự suy ra từ ngày hết hạn.',
        'Xung đột vận hành (xe đang có chuyến nhưng giấy tờ hết hạn) là cảnh báo của máy chủ, không phải phép tính ở đây.',
        'Ngưỡng cảnh báo chỉ hiển thị ở nơi API công khai của T6 cho phép cấu hình.',
      ]}
    />
  );
}

/**
 * `TX-07`. Cung khuon nhu tren, va them mot rang buoc rieng: phieu luong da tra KHONG bao gio duoc
 * tinh lai de len man hinh — sua la bang phieu bo sung/hoan, theo dung vong doi cua T6 sau khi merge.
 */
export function PayrollView() {
  return (
    <AwaitingSection
      section="payroll"
      designNote={[
        'Kỳ lương, bảng tính thử, danh sách và chi tiết phiếu lương.',
        'Các khoản cấu thành hiển thị đúng như máy chủ trả về, không tính lại ở màn hình.',
        'Luồng duyệt / trả / sửa theo vòng đời T6 sau khi merge, không đoán trước.',
        'Phiếu lương đã trả chỉ sửa bằng phiếu bổ sung hoặc phiếu hoàn — không tính lại đè lên.',
        'Lái xe xem phiếu lương của chính mình ở bề mặt lái xe, sau khi mã năng lực TX-07 xuất hiện.',
      ]}
    />
  );
}
