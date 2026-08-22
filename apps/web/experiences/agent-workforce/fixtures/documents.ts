import type { DocumentItem } from '../services/types';

export const SAMPLE_DOCUMENTS: readonly DocumentItem[] = [
  {
    id: 'doc-contract-01',
    title: 'Hợp đồng Cung ứng Linh kiện Cơ khí HĐ-2026-VF09',
    type: 'contract',
    uploadedAt: '20/08/2026 11:15',
    fileSize: '1.4 MB (PDF)',
    status: 'analyzed',
    mode: 'contract_review',
    analysis: {
      metadata: {
        'Số hợp đồng': 'HĐ-2026-VF09/WATATECH-VF',
        'Bên bán (Bên A)': 'Công ty Cổ phần Công nghệ WATA',
        'Bên mua (Bên B)': 'Tập đoàn Sản xuất Công nghiệp & Xe điện VinFast',
        'Tổng giá trị': '3.850.000.000 VNĐ (Chưa VAT)',
        'Thời hạn thực hiện': '12 tháng (kể từ 01/09/2026)',
        'Địa điểm giao hàng': 'Nhà máy Sản xuất Ô tô Hải Phòng',
      },
      keyClausesOrItems: [
        {
          name: 'Điều 7.2 — Phạt vi phạm tiến độ giao hàng',
          value: '1.5% giá trị đợt giao mỗi ngày chậm trễ; tổng mức phạt tối đa 15% tổng giá trị hợp đồng.',
          riskLevel: 'high_risk',
          note: 'Vượt trần quy định nội bộ 8% (Quy chế Pháp chế QC-PL-02). Đề xuất sửa thành 0.5%/ngày, tối đa 8%.',
        },
        {
          name: 'Điều 5.1 — Điều khoản thanh toán đợt',
          value: 'Thanh toán 30% khi ký HĐ, 50% khi nhận hàng đợt 1, 20% giữ lại bảo hành sau 6 tháng.',
          riskLevel: 'caution',
          note: 'Cần thương lượng bảo lãnh bảo hành của ngân hàng thay cho việc giữ lại 20% tiền mặt 6 tháng.',
        },
        {
          name: 'Điều 9.3 — Bảo mật thông tin & Quyền sở hữu trí tuệ',
          value: 'Bên bán giữ toàn quyền sở hữu bản vẽ công nghệ thiết kế module điều khiển.',
          riskLevel: 'safe',
          note: 'Điều khoản đạt chuẩn bảo vệ quyền tác giả và công nghệ lõi của công ty.',
        },
        {
          name: 'Điều 12 — Sự kiện Bất khả kháng',
          value: 'Bao gồm thiên tai, dịch bệnh, đứt gãy chuỗi cung ứng toàn cầu có xác nhận của VCCI.',
          riskLevel: 'safe',
          note: 'Đầy đủ căn cứ pháp lý theo Bộ luật Dân sự và Luật Thương mại 2005.',
        },
      ],
      complianceFindings: [
        {
          rule: 'Giới hạn mức phạt vi phạm hợp đồng thương mại',
          result: 'flagged',
          detail: 'Điều khoản phạt 15% vượt trần 8% theo Luật Thương mại 2005 (Điều 301) và Quy chế nội bộ.',
        },
        {
          rule: 'Kiểm soát rủi ro dòng tiền và bảo lãnh bảo hành',
          result: 'deviated',
          detail: 'Tỷ lệ giữ lại 20% trong 6 tháng ảnh hưởng lưu chuyển tiền tệ quý 4; đề xuất chuyển sang bảo lãnh ngân hàng.',
        },
        {
          rule: 'Bảo vệ quyền sở hữu trí tuệ và bí mật kinh doanh',
          result: 'pass',
          detail: 'Quyền tác giả và tài sản trí tuệ đối với phần mềm/thuật toán được xác lập rõ ràng thuộc WATA.',
        },
      ],
      provenance: 'AI Kế toán & Pháp chế trích xuất và đối chiếu Quy chế Quản trị Hợp đồng QC-PL-02.',
      confidence: 96.8,
    },
  },
  {
    id: 'doc-invoice-01',
    title: 'Hóa đơn Điện tử GTGT VAT-002891 (Công ty Đại Phát)',
    type: 'invoice',
    uploadedAt: '20/08/2026 08:30',
    fileSize: '840 KB (PDF / XML)',
    status: 'analyzed',
    mode: 'invoice_extraction',
    analysis: {
      metadata: {
        'Mẫu số / Ký hiệu': '1/001 — C26TDP',
        'Số hóa đơn': '0002891',
        'Ngày lập': '15/07/2026',
        'Đơn vị bán': 'Công ty Cổ phần Công nghệ WATA (MST: 0108998877)',
        'Đơn vị mua': 'Công ty TNHH Cơ khí Chính xác Đại Phát (MST: 0314567890)',
        'Hình thức thanh toán': 'Chuyển khoản (Net-30)',
      },
      keyClausesOrItems: [
        {
          name: '1. Module điều khiển chuyển động Robot MC-04',
          value: '40 bộ × 10.000.000đ = 400.000.000đ (Chưa VAT)',
          riskLevel: 'safe',
          note: 'Khớp 100% với phiếu xuất kho PXK-2026-0812 và đơn đặt hàng PO-7712.',
        },
        {
          name: '2. Cảm biến tiệm cận độ chính xác cao PS-12',
          value: '20 bộ × 4.000.000đ = 80.000.000đ (Chưa VAT)',
          riskLevel: 'safe',
          note: 'Khớp đơn giá theo bảng giá đại lý Cấp 1 đã duyệt.',
        },
        {
          name: 'Tổng tiền hàng & Thuế VAT',
          value: 'Tiền hàng: 480.000.000đ | VAT (10%): 48.000.000đ | Tổng cộng: 528.000.000đ',
          riskLevel: 'caution',
          note: 'Đã quá hạn thanh toán 5 ngày so với hạn thanh toán 15/08/2026 (Net-30).',
        },
      ],
      complianceFindings: [
        {
          rule: 'Tính hợp lệ của Hóa đơn điện tử theo NĐ 123/2020/NĐ-CP',
          result: 'pass',
          detail: 'Hóa đơn có mã của Cơ quan Thuế, chữ ký số điện tử bên bán hợp lệ và nguyên vẹn.',
        },
        {
          rule: 'Đối chiếu khớp 3 điểm: Đơn hàng — Xuất kho — Hóa đơn',
          result: 'pass',
          detail: 'Số lượng và đơn giá khớp 100% giữa Lệnh xuất kho và Hợp đồng khung.',
        },
        {
          rule: 'Kỳ hạn thanh toán công nợ theo chính sách bán hàng',
          result: 'flagged',
          detail: 'Khoản thanh toán 528 triệu đã quá hạn ngày 15/08; hệ thống đã phát cảnh báo Smart Alert.',
        },
      ],
      provenance: 'AI Kế toán & Pháp chế bóc tách từ file XML gốc và đối chiếu dữ liệu sổ cái công nợ.',
      confidence: 99.2,
    },
  },
  {
    id: 'doc-sop-01',
    title: 'Quy trình Quản lý Tồn kho & Vật tư Sản xuất SOP-WH-04',
    type: 'sop',
    uploadedAt: '18/08/2026 14:00',
    fileSize: '2.1 MB (PDF)',
    status: 'analyzed',
    mode: 'general',
    analysis: {
      metadata: {
        'Mã tài liệu': 'SOP-WH-04/V2.1',
        'Cơ quan ban hành': 'Khối Vận hành & Sản xuất WATATECH',
        'Ngày hiệu lực': '01/06/2026',
        'Phạm vi áp dụng': 'Toàn bộ hệ thống kho vật tư Nhà máy 1 và Nhà máy 2',
        'Tiêu chuẩn tham chiếu': 'ISO 9001:2015 & Hệ thống 5S',
      },
      keyClausesOrItems: [
        {
          name: 'Mục 3.2 — Ngưỡng tồn kho an toàn cho Nhôm tấm 6061',
          value: 'Mức an toàn tối thiểu: 3.0 tấn. Điểm đặt hàng lại (ROP): 4.5 tấn.',
          riskLevel: 'safe',
          note: 'Căn cứ để AI Sản xuất tự động kích hoạt cảnh báo tồn kho.',
        },
        {
          name: 'Mục 4.1 — Nguyên tắc xuất nhập kho FIFO',
          value: 'Mọi lô vật tư nhập trước phải được cấp phát trước kèm chứng chỉ CO/CQ.',
          riskLevel: 'safe',
          note: 'Đảm bảo không bị suy giảm chất lượng phôi kim loại lưu kho.',
        },
        {
          name: 'Mục 5.3 — Quy trình mua hàng khẩn cấp (Emergency PO)',
          value: 'Khi tồn kho dưới mức an toàn 50%, Trưởng phòng Mua hàng được quyền phát hành PO khẩn trong 4 giờ.',
          riskLevel: 'safe',
          note: 'Đã kích hoạt cho sự cố thiếu hụt Nhôm tấm sáng nay.',
        },
      ],
      complianceFindings: [
        {
          rule: 'Đồng bộ ngưỡng cảnh báo vào hệ thống AI Agent',
          result: 'pass',
          detail: 'Ngưỡng tồn kho tối thiểu 3.0 tấn đã được nạp tự động vào Rule Engine của AI Sản xuất.',
        },
        {
          rule: 'Kiểm soát chứng từ truy xuất nguồn gốc CO/CQ',
          result: 'pass',
          detail: '100% phiếu nhập kho yêu cầu đính kèm file quét chứng chỉ xuất xưởng.',
        },
      ],
      provenance: 'Nguồn tri thức quy trình nội bộ được số hóa vào Knowledge Engine.',
      confidence: 98.5,
    },
  },
];
