'use client';

interface CoreCapability {
  num: string;
  title: string;
  desc: string;
}

const CORE_CAPABILITIES: CoreCapability[] = [
  {
    num: '01',
    title: 'Thấu hiểu dữ liệu đầu vào',
    desc: 'Tiếp nhận ngôn ngữ tự nhiên từ Zalo, Messenger, Web và hình ảnh bảng kê, trích xuất chuẩn xác vào từ điển đóng của doanh nghiệp mà không suy đoán tùy tiện.',
  },
  {
    num: '02',
    title: 'Áp dụng quy tắc nghiệp vụ tất định',
    desc: 'Toàn bộ bảng giá, chiết khấu, hạn mức công nợ và điều khoản vận chuyển được tính toán bằng Rules Engine độc lập, đảm bảo chính xác 100%.',
  },
  {
    num: '03',
    title: 'Phân luồng thực thi an toàn',
    desc: 'Tự động gửi xác nhận với các đơn/yêu cầu hợp lệ trong ngưỡng; lập tức chuyển sang hàng việc của nhân sự khi phát hiện ngoại lệ hoặc vượt hạn mức.',
  },
  {
    num: '04',
    title: 'Lưu vết & Kiểm soát toàn diện',
    desc: 'Ghi nhật ký kiểm toán (audit log) từng bước trích xuất, đối soát quy tắc và gửi tin, cho phép nhân sự tra cứu và kiểm soát bất cứ lúc nào.',
  },
];

export function PlatformOverview() {
  return (
    <section className="platform-overview-section" id="platform" aria-label="Khái quát nền tảng nexagnet">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>ĐỊNH VỊ NỀN TẢNG</span>
          </div>

          <h2 className="section-headline">
            Một nền tảng.
            <br />
            Nhiều quy trình vận hành.
          </h2>

          <p className="section-subheadline">
            nexagnet không phải là một chatbot hội thoại chung chung. Đây là nền tảng vận hành kết hợp trí tuệ nhân tạo (AI), công cụ quy tắc nghiệp vụ (Rules Engine) và cổng kiểm duyệt nhân sự (Human-in-the-loop).
          </p>
        </div>

        {/* 4 Core Pillars Grid */}
        <div className="overview-pillars-grid">
          {CORE_CAPABILITIES.map((cap) => (
            <div key={cap.num} className="pillar-card">
              <div className="pillar-num">{cap.num}</div>
              <h3 className="pillar-title">{cap.title}</h3>
              <p className="pillar-desc">{cap.desc}</p>
            </div>
          ))}
        </div>

        {/* Unified Infrastructure Banner */}
        <div className="unified-infra-banner">
          <div className="infra-inner">
            <div className="infra-left">
              <span className="infra-tag">HẠ TẦNG DÙNG CHUNG</span>
              <h4 className="infra-title">Tất cả các module vận hành trên cùng một bộ não quản trị</h4>
              <p className="infra-desc">
                Dù bạn bắt đầu bằng quy trình xử lý đơn hàng hay tra cứu tri thức bảo hành, toàn bộ dữ liệu sản phẩm, chính sách đại lý và lịch sử kiểm toán đều được quản lý tập trung từ một nguồn sự thật (Source of Truth) duy nhất.
              </p>
            </div>
            <div className="infra-right">
              <div className="infra-badge-stack">
                <span className="i-badge">✓ Một Nguồn Sự Thật</span>
                <span className="i-badge">✓ Một Lớp Quy Tắc Chung</span>
                <span className="i-badge">✓ Một Cổng Phân Quyền</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
