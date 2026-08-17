'use client';

interface ComparisonRow {
  feature: string;
  traditional: string;
  nexagnet: string;
  isPositive: boolean;
}

const COMPARISONS: ComparisonRow[] = [
  {
    feature: 'Cơ chế hiểu ngôn ngữ tự nhiên',
    traditional: 'Khớp từ khóa hoặc bấm nút cứng nhắc; khách gõ sai chính tả là bot không hiểu',
    nexagnet: 'Mô hình AI RAG hiểu ngữ cảnh phức tạp, tin nhắn viết tắt, không dấu và câu hỏi nhiều ý',
    isPositive: true,
  },
  {
    feature: 'Độ chính xác về giá & chính sách',
    traditional: 'AI tự sinh câu trả lời tự do, dễ bịa đặt giá (hallucination) gây tổn hại uy tín',
    nexagnet: 'Tách bạch tuyệt đối: Rules Engine tất định 100% bằng code TypeScript độc lập tính toán',
    isPositive: true,
  },
  {
    feature: 'Khả năng cập nhật tri thức',
    traditional: 'Phải vẽ lại sơ đồ luồng cây quyết định phức tạp mỗi khi đổi giá hoặc ra sản phẩm mới',
    nexagnet: 'Chỉ cần tải file PDF, Excel hoặc cập nhật qua Google Drive; hệ thống tự học sau vài giây',
    isPositive: true,
  },
  {
    feature: 'Kiểm soát rủi ro & Ngoại lệ',
    traditional: 'Không có cơ chế phát hiện đơn lớn hay khách phàn nàn, bot cứ tự động trả lời sai',
    nexagnet: 'Cổng kiểm duyệt Human-in-the-loop tự động chuyển giao cho nhân sự khi phát hiện ngoại lệ',
    isPositive: true,
  },
  {
    feature: 'Độ phủ kênh liên lạc tại VN',
    traditional: 'Chủ yếu hỗ trợ Web Widget đơn giản, không đọc được nhóm Zalo đại lý/CTV',
    nexagnet: 'Hỗ trợ toàn diện: Zalo cá nhân/OA, Messenger, Web Widget, Telegram và webhook ERP',
    isPositive: true,
  },
];

export function ComparisonSection() {
  return (
    <section className="comparison-section" id="comparison" aria-label="So sánh năng lực">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>TẠI SAO CHỌN NEXAGNET</span>
          </div>

          <h2 className="section-headline">
            Sự khác biệt giữa Chatbot truyền thống
            <br />
            và AI Agent vận hành chuẩn doanh nghiệp.
          </h2>

          <p className="section-subheadline">
            Đừng để chatbot trả lời sai lệch phá hỏng uy tín thương hiệu của bạn. nexagnet mang lại sự tin cậy tuyệt đối nhờ kiến trúc công nghệ kiểm soát chặt chẽ.
          </p>
        </div>

        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th className="th-feature">NĂNG LỰC VẬN HÀNH</th>
                <th className="th-traditional">Chatbot kịch bản / AI tự do</th>
                <th className="th-nexagnet">
                  <div className="nex-header-badge">
                    <span>★ nexagnet AI Agent</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISONS.map((row, idx) => (
                <tr key={idx}>
                  <td className="td-feature font-medium">{row.feature}</td>
                  <td className="td-traditional">
                    <span className="cross-icon">✕</span>
                    <span>{row.traditional}</span>
                  </td>
                  <td className="td-nexagnet">
                    <span className="check-icon">✓</span>
                    <span>{row.nexagnet}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
