import type { SmartAlert } from '../services/types';

export const INITIAL_SMART_ALERTS: readonly SmartAlert[] = [
  {
    id: 'alert-legal-01',
    type: 'legal',
    severity: 'critical',
    title: 'Hợp đồng cần rà soát: Điều khoản phạt chậm giao hàng vượt chuẩn',
    summary:
      'Dự thảo hợp đồng cung ứng linh kiện Q3/2026 với đối tác VinFast (HĐ-2026-VF09) có mức phạt chậm tiến độ 1.5%/ngày (tối đa 15%), vượt ngưỡng quy định nội bộ 8%.',
    sourceAgent: 'AI Kế toán & Pháp chế',
    sourceAgentId: 'legal_finance',
    createdAt: 'Hôm nay, 11:30',
    status: 'open',
    assignee: 'Luật sư Trưởng / Ban Pháp chế',
    relatedEntity: {
      type: 'contract',
      id: 'doc-contract-01',
      name: 'HĐ-2026-VF09 (Hợp đồng cung ứng linh kiện Q3)',
    },
    recommendedAction:
      'Đàm phán hạ mức phạt chậm tiến độ xuống 0.5%/ngày (tổng không quá 8%) và bổ sung điều khoản miễn trừ thời gian phê duyệt mẫu ban đầu.',
    policyRuleApplied: 'Quy chế Pháp chế & Quản trị Hợp đồng (Mục 4.2 - Giới hạn chế tài phạt vi phạm)',
    rootCause:
      'Mẫu hợp đồng do bên mua cung cấp áp dụng điều khoản chuẩn của chuỗi cung ứng ô tô khắt khe hơn mẫu tiêu chuẩn của công ty.',
  },
  {
    id: 'alert-fin-02',
    type: 'finance',
    severity: 'warning',
    title: 'Công nợ sắp đến hạn: Khoản phải thu 480 triệu từ Khách hàng Đại Phát',
    summary:
      'Khoản phải thu trị giá 480.000.000đ theo hóa đơn GTGT VAT-002891 đã quá hạn 5 ngày so với điều khoản thanh toán Net-30.',
    sourceAgent: 'AI Kế toán & Pháp chế',
    sourceAgentId: 'legal_finance',
    createdAt: 'Hôm nay, 08:45',
    status: 'open',
    assignee: 'Kế toán Công nợ / Sale phụ trách',
    relatedEntity: {
      type: 'invoice',
      id: 'doc-invoice-01',
      name: 'VAT-002891 (Hóa đơn Đại Phát Q2)',
    },
    recommendedAction:
      'Gửi thư nhắc nợ tự động lần 1 kèm bảng đối chiếu công nợ chi tiết; tạm khóa cấp hạn mức tín dụng cho các đơn hàng phát sinh mới.',
    policyRuleApplied: 'Chính sách Quản lý Công nợ Đại lý (Điều 6 - Quy trình xử lý quá hạn Net-30)',
    rootCause:
      'Bộ phận kế toán khách hàng chuyển kỳ quyết toán sang tuần cuối tháng do thay đổi nhân sự.',
  },
  {
    id: 'alert-inv-03',
    type: 'inventory',
    severity: 'warning',
    title: 'Tồn kho xuống ngưỡng an toàn: Nhôm tấm 6061-T6 tại Nhà máy 2',
    summary:
      'Số lượng tồn khả dụng Nhôm 6061-T6 chỉ còn 1.8 tấn, dưới ngưỡng an toàn tối thiểu 3.0 tấn (chỉ đủ duy trì 4 ngày sản xuất).',
    sourceAgent: 'AI Sản xuất',
    sourceAgentId: 'manufacturing',
    createdAt: 'Hôm nay, 08:15',
    status: 'in_progress',
    assignee: 'Trưởng phòng Mua hàng & Vật tư',
    relatedEntity: {
      type: 'inventory_item',
      id: 'mat-al-6061',
      name: 'Nhôm tấm 6061-T6 (Dày 12mm)',
    },
    recommendedAction:
      'Kích hoạt đơn đặt hàng nhanh (PO khẩn) 5.0 tấn từ Nhà cung cấp Kim Loại Á Châu theo hợp đồng khung đã ký.',
    policyRuleApplied: 'Quy trình Quản lý Tồn kho Vật tư Sản xuất (SOP-WH-04)',
    rootCause:
      'Lô sản xuất vỏ hộp điều khiển SO-8790 tiêu hao tăng thêm 15% do bổ sung đơn hàng xuất khẩu gấp.',
  },
  {
    id: 'alert-mfg-04',
    type: 'production',
    severity: 'critical',
    title: 'Đơn sản xuất có rủi ro ETA: Lô đơn hàng SO-8842 có nguy cơ trễ 1.5 ngày',
    summary:
      'Cảnh báo rung động bất thường tại trục chính máy cắt Laser CNC-03 dẫn đến công suất gia công giảm 40%; đơn hàng SO-8842 dự kiến giao 22/08 có nguy cơ trễ.',
    sourceAgent: 'AI Sản xuất',
    sourceAgentId: 'manufacturing',
    createdAt: 'Hôm nay, 09:40',
    status: 'open',
    assignee: 'Quản đốc Phân xưởng Gia công',
    relatedEntity: {
      type: 'production_order',
      id: 'order-so-8842',
      name: 'Lệnh sản xuất SO-8842 (Khung máy chính)',
    },
    recommendedAction:
      'Chuyển 60% khối lượng cắt phôi sang máy Laser CNC-05 phụ trợ và sắp xếp bảo trì trục chính CNC-03 trong ca đêm.',
    policyRuleApplied: 'Quy trình Điều độ Sản xuất & Phản ứng Sự cố (MPS-PROC-02)',
    rootCause:
      'Mòn bạc đạn cụm đầu cắt sau 3.200 giờ vận hành liên tục; hệ thống PdM đã phát hiện phổ rung bất thường.',
  },
];
