'use client';

interface FAQ {
  q: string;
  a: string;
}

const FAQS: FAQ[] = [
  {
    q: 'Đại lý trong nhóm Zalo có cần phải gõ đúng cú pháp cố định hoặc @mention bot không?',
    a: 'Không cần. nexagnet được xây dựng để đại lý có thể nhắn tin hoàn toàn tự nhiên theo thói quen cũ (viết tắt, không dấu, gõ vội). Hệ thống tự động đọc và trích xuất mà không bắt buộc người mua phải học cú pháp mới.',
  },
  {
    q: 'Hệ thống đảm bảo an toàn cho tài khoản Zalo như thế nào?',
    a: 'nexagnet hỗ trợ kết nối qua tài khoản Zalo chuyên biệt hoặc Zalo OA chính thức, đồng thời áp dụng cơ chế giãn cách gửi tin (pacing) và kiểm soát lưu lượng nghiêm ngặt, đảm bảo tuân thủ đầy đủ chính sách vận hành.',
  },
  {
    q: 'Khi có bảng giá mới hoặc thay đổi chính sách chiết khấu, làm sao để cập nhật?',
    a: 'Nhân sự chỉ cần cập nhật trực tiếp qua Bảng điều khiển quản trị (Admin Panel) hoặc qua cơ sở dữ liệu Postgres. Hệ thống sẽ tự động đồng bộ ngay lập tức mà không cần khởi động lại.',
  },
  {
    q: 'Hệ thống hỗ trợ tiếp nhận ảnh chụp bảng kê viết tay như thế nào?',
    a: 'nexagnet cung cấp module mở rộng Vision AI để hỗ trợ đọc bảng kẻ cột và chữ viết tay từ ảnh chụp hội thoại. Để đảm bảo an toàn tuyệt đối, hệ thống luôn có chốt chặn an toàn: nếu ảnh chụp mờ, rách hoặc thông tin không rõ ràng, đơn hàng lập tức được chuyển về Hàng việc để Sales đối chiếu trước khi gửi.',
  },
  {
    q: 'Đơn hàng sau khi AI xác nhận trên Zalo sẽ được đưa vào phần mềm quản trị (ERP) như thế nào?',
    a: 'Trong giai đoạn vận hành ban đầu, sau khi AI gửi xác nhận vào nhóm Zalo, hệ thống hiển thị đầy đủ thông tin chuẩn hóa trên Hàng việc để nhân sự sao chép/nhập vào KiotViet, SAP, Bravo hoặc Base nhanh chóng. Với các doanh nghiệp có nhu cầu tự động hóa sâu, nexagnet cung cấp sẵn cổng tích hợp ErpPort để kết nối trực tiếp qua API/Webhook ở các giai đoạn tiếp theo.',
  },
];

export function OrderAutomationFAQ() {
  return (
    <section className="order-faq-section" id="faq" aria-label="Câu hỏi thường gặp về Order Automation">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>GIẢI ĐÁP THẮC MẮC</span>
          </div>

          <h2 className="section-headline">
            Câu hỏi thường gặp về
            <br />
            Order Automation.
          </h2>

          <p className="section-subheadline">
            Mọi điều bạn cần biết trước khi ứng dụng tự động hóa xử lý đơn hàng Zalo vào doanh nghiệp.
          </p>
        </div>

        <div className="order-faq-accordion-list">
          {FAQS.map((faq, idx) => (
            <details key={idx} className="faq-accordion-card">
              <summary className="faq-summary-head">
                <span className="faq-question-text">{faq.q}</span>
                <span className="faq-plus-icon" aria-hidden="true">＋</span>
              </summary>
              <div className="faq-body-content">
                <p>{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
