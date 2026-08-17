'use client';

interface FAQItem {
  q: string;
  a: string;
}

const PLATFORM_FAQS: FAQItem[] = [
  {
    q: 'nexagnet là gì và khác gì so với các chatbot AI thông thường?',
    a: 'nexagnet là nền tảng AI vận hành doanh nghiệp (Enterprise AI Operations Platform) theo kiến trúc module. Khác với chatbot hội thoại tự do, nexagnet tách bạch rạch ròi giữa năng lực đọc hiểu ngôn ngữ của AI và logic tính toán quy tắc kinh doanh (Rules Engine). AI không tự tính tiền, không tự quyết chính sách, và con người luôn giữ quyền kiểm soát cao nhất thông qua Cổng kiểm duyệt Human-in-the-Loop.',
  },
  {
    q: 'Doanh nghiệp nên bắt đầu triển khai từ đâu?',
    a: 'Bạn nên bắt đầu từ một quy trình có khối lượng công việc lặp lại lớn nhất và rõ ràng nhất — ví dụ như Tự động hóa xử lý đơn hàng Zalo (Order Automation) hoặc Tra cứu tri thức CSKH (Knowledge Base). Sau khi quy trình đầu tiên vận hành ổn định và chứng minh hiệu quả, doanh nghiệp có thể bật thêm các module tiếp theo.',
  },
  {
    q: 'Có cần phải thay đổi toàn bộ hệ thống hoặc phần mềm quản trị hiện tại không?',
    a: 'Hoàn toàn không. nexagnet được thiết kế để hoạt động như một lớp thông minh bổ trợ phía trên các kênh trao đổi sẵn có và đồng hành cùng quy trình quản trị hiện tại của doanh nghiệp. Đội ngũ Sales nhận việc chuẩn hóa để cập nhật nhanh vào phần mềm quản lý, đồng thời hệ thống cung cấp sẵn cổng ErpPort cho các giai đoạn tích hợp tự động hóa tiếp theo.',
  },
  {
    q: 'Hệ thống có hỗ trợ triển khai thử nghiệm từng bước (Phased Rollout) không?',
    a: 'Có. Bạn có thể bắt đầu ở chế độ Hỗ trợ Sales (Co-pilot — AI trích xuất và soạn sẵn đơn, nhân sự duyệt 100%), sau đó nâng dần lên chế độ Bán tự động (đơn hợp lệ trong hạn mức an toàn tự gửi, đơn ngoại lệ chuyển Sales), giúp đội ngũ làm quen an toàn.',
  },
  {
    q: 'Dữ liệu kinh doanh và khách hàng của chúng tôi được bảo vệ như thế nào?',
    a: 'Toàn bộ dữ liệu được lưu trữ trên hạ tầng bảo mật của doanh nghiệp, tuân thủ Luật Bảo vệ dữ liệu cá nhân (91/2025/QH15 và Nghị định 356/2025). Hệ thống chỉ sử dụng các API đối tác được ký thỏa thuận xử lý dữ liệu và tuyệt đối không dùng dữ liệu nội bộ của bạn để train các mô hình AI công cộng.',
  },
  {
    q: 'AI có bao giờ tự ý ra quyết định tài chính hoặc gửi tin nhắn sai lệch không?',
    a: 'Không. Toàn bộ logic tính giá, thuế VAT, chiết khấu và kiểm tra hạn mức công nợ được thực thi bởi Rules Engine bằng code tất định từ Nguồn sự thật (Source of Truth) trong cơ sở dữ liệu. AI chỉ đóng vai trò trích xuất và soạn thảo văn bản, không có quyền can thiệp vào logic tính toán.',
  },
];

export function PlatformFAQ() {
  return (
    <section className="platform-faq-section" id="faq" aria-label="Câu hỏi thường gặp về nền tảng">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>GIẢI ĐÁP THẮC MẮC</span>
          </div>

          <h2 className="section-headline">
            Câu hỏi thường gặp về nexagnet.
          </h2>

          <p className="section-subheadline">
            Những thông tin cần biết để bắt đầu ứng dụng AI vào quy trình vận hành thực tế của doanh nghiệp bạn.
          </p>
        </div>

        <div className="platform-faq-accordion-list">
          {PLATFORM_FAQS.map((faq, idx) => (
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
