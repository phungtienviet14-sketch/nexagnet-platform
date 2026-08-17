'use client';

interface CompCriteria {
  criteria: string;
  manual: string;
  genericBot: string;
  nexagnet: string;
}

const CRITERIA_LIST: CompCriteria[] = [
  {
    criteria: 'Đọc hiểu tin nhắn viết tắt, không dấu',
    manual: 'Phụ thuộc vào trí nhớ và kinh nghiệm của từng nhân viên sales',
    genericBot: 'Không xử lý được; bắt buộc khách phải gõ đúng cú pháp cố định',
    nexagnet: 'Mô hình AI chuyên biệt ánh xạ chuẩn xác vào từ điển đóng của công ty',
  },
  {
    criteria: 'Đối soát giá & hạn mức công nợ',
    manual: 'Tra cứu thủ công qua file Excel/ERP, dễ nhầm cấp đại lý khi cao điểm',
    genericBot: 'Không có Rules Engine; dễ bịa đặt giá hoặc xác nhận sai chính sách',
    nexagnet: 'Rules Engine độc lập tính toán tất định 100% từ Nguồn sự thật trong DB',
  },
  {
    criteria: 'Tốc độ phản hồi & gửi xác nhận',
    manual: 'Tốn 3 - 5 phút cho mỗi đơn (hoặc hàng giờ nếu ngoài giờ làm việc)',
    genericBot: 'Nhanh nhưng thường xuyên sai lệch hoặc không khớp nghiệp vụ thật',
    nexagnet: 'Xử lý và phản hồi tức thì cho đơn hợp lệ; vận hành 24/7 không gián đoạn',
  },
  {
    criteria: 'Kiểm soát rủi ro & trường hợp ngoại lệ',
    manual: 'Khó kiểm soát đồng đều khi quy mô mở rộng lên 200-300 nhóm Zalo',
    genericBot: 'Không có cơ chế chuyển giao thông minh; dễ phát sinh tranh chấp',
    nexagnet: 'Cổng Human-in-the-loop chuyển Sales duyệt khi phát hiện ngoại lệ',
  },
];

export function OrderAutomationComparison() {
  return (
    <section className="order-comparison-section" id="comparison" aria-label="So sánh hiệu quả">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>SO SÁNH HIỆU QUẢ VẬN HÀNH</span>
          </div>

          <h2 className="section-headline">
            Khác biệt vượt trội so với
            <br />
            nhập tay và chatbot thông thường.
          </h2>

          <p className="section-subheadline">
            Đánh giá khách quan giữa 3 phương thức tiếp nhận và xử lý đơn hàng hội thoại hiện nay.
          </p>
        </div>

        <div className="order-comparison-table-wrap">
          <table className="order-comparison-table">
            <thead>
              <tr>
                <th className="th-col-crit">TIÊU CHÍ</th>
                <th className="th-col-man">Nhập liệu thủ công</th>
                <th className="th-col-bot">Chatbot kịch bản cũ</th>
                <th className="th-col-nex">★ nexagnet Order Automation</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA_LIST.map((row, idx) => (
                <tr key={idx}>
                  <td className="td-crit font-medium">{row.criteria}</td>
                  <td className="td-man">{row.manual}</td>
                  <td className="td-bot">{row.genericBot}</td>
                  <td className="td-nex">{row.nexagnet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
