import type { AssistantMessage } from '../services/types';

export const INITIAL_ASSISTANT_CONVERSATION: readonly AssistantMessage[] = [
  {
    id: 'msg-welcome',
    sender: 'assistant',
    text: 'Xin chào Tổng Giám đốc và Ban Điều hành. Tôi là **AI Trợ lý điều hành NetViet**, kết nối trực tiếp với 6 nhóm Agent nghiệp vụ để hỗ trợ theo dõi công việc, tra cứu quy trình và điều phối quyết định vận hành hôm nay.',
    timestamp: 'Hôm nay, 08:00',
    sources: [
      {
        title: 'Nguồn tri thức điều hành NetViet',
        category: 'Hệ thống',
        snippet: 'Đã nạp quy chế vận hành, 6 nhóm Agent chuyên trách và danh mục 34 năng lực.',
      },
    ],
    actionSuggestions: [
      { label: 'Việc cần xử lý hôm nay', actionType: 'custom', prompt: 'Hôm nay có việc gì cần tôi xử lý?' },
      { label: 'Tóm tắt cảnh báo quan trọng', actionType: 'custom', prompt: 'Tóm tắt các cảnh báo quan trọng.' },
      { label: 'Quy trình phê duyệt hợp đồng', actionType: 'custom', prompt: 'Tìm quy trình phê duyệt hợp đồng.' },
      { label: 'Hoạt động kinh doanh hôm nay', actionType: 'custom', prompt: 'Tóm tắt hoạt động kinh doanh hôm nay.' },
    ],
  },
];

export const DETERMINISTIC_ASSISTANT_RESPONSES: Record<string, Omit<AssistantMessage, 'id' | 'timestamp'>> = {
  'hom nay co viec gi can toi xu ly': {
    sender: 'assistant',
    text: 'Báo cáo Tổng Giám đốc: Hiện có **4 mục công việc quan trọng cần ban điều hành lưu ý và phê duyệt**, trong đó có **2 mục khẩn cấp** liên quan đến hợp đồng và tiến độ giao hàng:',
    structuredData: {
      type: 'risk_summary',
      title: 'Danh sách 4 việc trọng tâm cần xử lý',
      rows: [
        { label: '1. Pháp chế [Khẩn]', value: 'HĐ VinFast HĐ-2026-VF09 phạt chậm 15% (vượt trần 8%)', highlight: true },
        { label: '2. Sản xuất [Khẩn]', value: 'Lệnh SO-8842 có nguy cơ trễ 1.5 ngày do sự cố máy Laser', highlight: true },
        { label: '3. Tài chính [Cảnh báo]', value: 'Công nợ 480tr từ Đại Phát quá hạn 5 ngày (Net-30)' },
        { label: '4. Mua hàng [Cảnh báo]', value: 'Tồn kho Nhôm 6061 còn 1.8 tấn (dưới ngưỡng 3.0 tấn)' },
      ],
    },
    sources: [
      { title: 'Smart Alerts Queue', category: 'Cảnh báo vận hành', snippet: 'Tổng hợp từ AI Pháp chế và AI Sản xuất lúc 11:30.', docId: 'doc-contract-01' },
      { title: 'Quy chế Thẩm quyền Phê duyệt', category: 'Chính sách', snippet: 'Các điều khoản vượt trần rủi ro yêu cầu TGĐ phê chuẩn.' },
    ],
    actionSuggestions: [
      { label: 'Xem chi tiết hợp đồng VinFast', actionType: 'view_doc', targetId: 'doc-contract-01' },
      { label: 'Mở hòm thư Cảnh báo & Công việc', actionType: 'view_alert', targetId: 'alert-legal-01' },
      { label: 'Xem phương án điều độ sản xuất', actionType: 'view_agent', targetId: 'manufacturing' },
    ],
    status: 'warning',
  },
  'tom tat cac canh bao quan trong': {
    sender: 'assistant',
    text: 'Dưới đây là tóm tắt nhanh **2 cảnh báo cấp độ Khẩn cấp (Critical)** từ hệ thống Smart Alerts:\n\n1. **Pháp chế — Hợp đồng VinFast (HĐ-2026-VF09):**\n   - *Vấn đề:* Mức phạt chậm giao hàng bị ấn định 1.5%/ngày, tối đa 15% giá trị hợp đồng.\n   - *Đề xuất:* Đàm phán giữ mức 0.5%/ngày (tổng không quá 8%) và loại trừ thời gian chờ nghiệm thu mẫu.\n\n2. **Sản xuất — Nguy cơ trễ hạn đơn hàng SO-8842:**\n   - *Vấn đề:* Cảm biến máy Laser CNC-03 báo mòn bạc đạn, công suất giảm 40%.\n   - *Phương án:* Điều chuyển 60% phôi sang máy phụ CNC-05, bảo trì máy chính trong ca đêm để đảm bảo giao hàng đúng ngày 22/08.',
    sources: [
      { title: 'AI Kế toán & Pháp chế', category: 'Pháp lý', snippet: 'Phân tích điều khoản hợp đồng đối chiếu Quy chế Quản trị Hợp đồng.', docId: 'doc-contract-01' },
      { title: 'AI Sản xuất (PdM & Solver)', category: 'Vận hành xưởng', snippet: 'Tín hiệu cảm biến rung máy CNC-03 và mô phỏng cân bằng tải.' },
    ],
    actionSuggestions: [
      { label: 'Xem phân tích hợp đồng', actionType: 'view_doc', targetId: 'doc-contract-01' },
      { label: 'Mở danh sách cảnh báo', actionType: 'view_alert', targetId: 'alert-mfg-04' },
    ],
    status: 'warning',
  },
  'tim quy trinh phe duyet hop dong': {
    sender: 'assistant',
    text: 'Theo **Quy chế Quản lý Hợp đồng & Phân cấp Thẩm quyền (QC-PL-02)** của doanh nghiệp, quy trình phê duyệt gồm 4 bước chuẩn hóa:\n\n1. **Khởi tạo & Soạn thảo (Bộ phận phụ trách):** Nhập thông tin thương mại, giá trị đơn và đối tác lên hệ thống.\n2. **Rà soát Pháp chế (AI Pháp chế + Luật sư):** Tự động quét điều khoản, phát hiện sai lệch so với mẫu chuẩn.\n3. **Thẩm định Tài chính (Kế toán & Tài chính):** Kiểm tra hạn mức công nợ, điều khoản thanh toán và rủi ro dòng tiền.\n4. **Ký duyệt (Tổng Giám đốc / Người được ủy quyền):** Ký số phê duyệt trên hệ thống điều hành.',
    structuredData: {
      type: 'kpi_table',
      title: 'Hạn mức thẩm quyền phê duyệt hợp đồng',
      rows: [
        { label: 'Dưới 500 triệu VNĐ', value: 'Trưởng phòng Khối Kinh doanh / Mua hàng duyệt' },
        { label: 'Từ 500tr - 2 tỷ VNĐ', value: 'Phó Tổng Giám đốc phụ trách khối duyệt' },
        { label: 'Trên 2 tỷ VNĐ hoặc vượt trần rủi ro', value: 'Tổng Giám đốc trực tiếp phê chuẩn', highlight: true },
      ],
    },
    sources: [
      { title: 'Quy chế Pháp chế QC-PL-02', category: 'Quy định nội bộ', snippet: 'Chương 3: Trình tự thẩm định và phân quyền ký kết văn bản giao dịch.' },
      { title: 'Sổ tay Vận hành Điều hành', category: 'Tài liệu quản trị', snippet: 'Hạn mức phê duyệt và quy trình ký số điện tử.' },
    ],
    actionSuggestions: [
      { label: 'Rà soát hợp đồng mẫu', actionType: 'view_doc', targetId: 'doc-contract-01' },
      { label: 'Xem Agent Pháp chế', actionType: 'view_agent', targetId: 'legal_finance' },
    ],
    status: 'info',
  },
  'tom tat hoat dong kinh doanh hom nay': {
    sender: 'assistant',
    text: 'Báo cáo tổng quan hoạt động kinh doanh tính đến 16:00 hôm nay:\n\n- **Khối lượng xử lý:** AI Kinh doanh đã xử lý **35 tác vụ** tự động.\n- **Khách hàng tiềm năng:** Đã tiếp nhận và chấm điểm 12 lead mới; xác định **3 Hot Leads** từ nhóm đối tác sản xuất cơ khí và phụ tùng ô tô.\n- **Báo giá xuất sắc:** Đã tạo và gửi thành công báo giá 150 bộ linh kiện cho Công ty Nam Hà theo chính sách đại lý Cấp 1.\n- **Dự báo doanh số:** Doanh thu tháng 8 dự kiến đạt **92.4% chỉ tiêu kế hoạch năm**, bám sát kịch bản tăng trưởng quý 3.',
    structuredData: {
      type: 'kpi_table',
      title: 'Chỉ số kinh doanh nhanh trong ngày',
      rows: [
        { label: 'Số yêu cầu báo giá mới', value: '8 báo giá' },
        { label: 'Lead chất lượng cao (Hot Leads)', value: '3 khách hàng (Điểm > 85/100)' },
        { label: 'Tổng giá trị báo giá nháp', value: '1.42 tỷ VNĐ' },
        { label: 'Tiến độ doanh số tháng 8', value: '92.4% mục tiêu kế hoạch', highlight: true },
      ],
    },
    sources: [
      { title: 'AI Kinh doanh (Sales Engine)', category: 'Bán hàng B2B', snippet: 'Tổng hợp dữ liệu lead scoring và báo giá tự động ngày 20/08.' },
      { title: 'Bảng giá & Chính sách Đại lý', category: 'Nguồn sự thật', snippet: 'Cập nhật bảng giá bán buôn và chiết khấu bậc thang.' },
    ],
    actionSuggestions: [
      { label: 'Mở chi tiết AI Kinh doanh', actionType: 'view_agent', targetId: 'commercial' },
      { label: 'Xem cảnh báo công nợ liên quan', actionType: 'view_alert', targetId: 'alert-fin-02' },
    ],
    status: 'success',
  },
};
