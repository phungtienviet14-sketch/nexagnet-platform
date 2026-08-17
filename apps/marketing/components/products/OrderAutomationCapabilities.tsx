'use client';

interface CapDetail {
  icon: string;
  title: string;
  desc: string;
  bullets: string[];
}

const CAPABILITIES: CapDetail[] = [
  {
    icon: '📝',
    title: 'Linh hoạt cấu hình cấu trúc đơn hàng B2B',
    desc: 'Dễ dàng tùy biến theo các hình thức giao nhận và mô hình phân phối của từng doanh nghiệp.',
    bullets: [
      'Đơn giao đại lý / chi nhánh: Địa điểm nhận · Ngày · Tên đối tác · Số lượng x SKU · Biểu giá',
      'Đơn giao trực tiếp (Dropship): Kèm thông tin người nhận lẻ · SĐT / Địa chỉ · Cước ship · Thu hộ COD',
    ],
  },
  {
    icon: '💳',
    title: 'Tùy biến chính sách thương mại theo cấp đối tác',
    desc: 'Tự động nhận diện và đối soát đúng điều khoản tài chính theo từng hồ sơ đối tác trong Nguồn sự thật.',
    bullets: [
      'Công nợ theo kỳ hạn và hạn mức được duyệt trước',
      'Ký gửi định kỳ hoặc thanh toán ngay theo từng cấp CTV/đại lý',
      'COD có đối soát cước vận chuyển và phí thu hộ theo biểu mẫu',
    ],
  },
  {
    icon: '📷',
    title: 'Module Vision AI đọc ảnh bảng kê (Tùy chọn mở rộng)',
    desc: 'Năng lực trích xuất đơn hàng từ ảnh chụp bảng kê hoặc tin nhắn viết tay với cơ chế kiểm soát chất lượng hình ảnh.',
    bullets: [
      'Nhận diện bảng kê kẻ cột hoặc chữ viết tay trên hội thoại',
      'Ánh xạ mã sản phẩm nhận diện được với danh mục SKU chuẩn',
      'Tự động cảnh báo và chuyển nhân sự duyệt nếu ảnh quá mờ hoặc rách',
    ],
  },
  {
    icon: '🛡️',
    title: 'Phân luồng an toàn & Kill-Switch khẩn cấp',
    desc: 'Đảm bảo sự an tâm tuyệt đối cho doanh nghiệp khi đưa tự động hóa vào vận hành thực tế.',
    bullets: [
      'Ngưỡng số lượng tự động tùy chỉnh linh hoạt theo từng doanh nghiệp',
      'Đơn vượt ngưỡng hoặc có sai lệch giá tự động chuyển Sales duyệt',
      'Công tắc ngắt khẩn cấp (Kill-switch) tạm dừng gửi tin tự động bất cứ lúc nào',
    ],
  },
];

export function OrderAutomationCapabilities() {
  return (
    <section className="order-caps-section" id="capabilities" aria-label="Năng lực nghiệp vụ chi tiết">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>NĂNG LỰC NGHIỆP VỤ CHUYÊN SÂU</span>
          </div>

          <h2 className="section-headline">
            Được may đo chuẩn xác cho bài toán
            <br />
            phân phối tại thị trường Việt Nam.
          </h2>

          <p className="section-subheadline">
            Không phải là giải pháp chung chung được dịch từ nước ngoài. nexagnet Order Automation giải quyết chính xác thói quen đặt hàng thực tế của đại lý và CTV Việt Nam.
          </p>
        </div>

        <div className="caps-details-grid">
          {CAPABILITIES.map((cap, idx) => (
            <div key={idx} className="cap-detail-card">
              <div className="cap-icon-box">{cap.icon}</div>
              <h3 className="cap-title">{cap.title}</h3>
              <p className="cap-desc">{cap.desc}</p>
              <div className="cap-bullets-list">
                {cap.bullets.map((b, bIdx) => (
                  <div key={bIdx} className="cap-bullet-item">
                    <span className="b-check">✓</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
