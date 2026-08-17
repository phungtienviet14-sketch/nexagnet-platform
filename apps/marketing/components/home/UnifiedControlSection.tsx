'use client';

interface ControlFeature {
  icon: string;
  title: string;
  desc: string;
}

const CONTROL_FEATURES: ControlFeature[] = [
  {
    icon: '🗄️',
    title: 'Nguồn sự thật tập trung (Source of Truth)',
    desc: 'Bảng giá, danh mục sản phẩm, chính sách đại lý và từ điển viết tắt được quản trị tại một nơi duy nhất. Mọi module đều tham chiếu từ nguồn này.',
  },
  {
    icon: '⚖️',
    title: 'Rules Engine tất định độc lập',
    desc: 'Mọi quy tắc giá, chiết khấu và hạn mức công nợ được thực thi bằng logic code minh bạch, loại bỏ hoàn toàn rủi ro sai sót do AI tự tính toán.',
  },
  {
    icon: '📝',
    title: 'Nhật ký kiểm toán toàn diện (Audit Trail)',
    desc: 'Ghi nhận chi tiết từng bước: từ tin nhắn gốc, kết quả trích xuất của AI, dữ liệu đối soát quy tắc, đến nội dung gửi đi và người phê duyệt.',
  },
  {
    icon: '🛡️',
    title: 'Cổng phân quyền & Phê duyệt nhân sự',
    desc: 'Phân quyền chặt chẽ theo vai trò (Sales, Kế toán, Quản lý). Đơn vượt hạn mức an toàn luôn yêu cầu nhân sự bấm duyệt trước khi thực thi.',
  },
  {
    icon: '🛑',
    title: 'Công tắc ngắt khẩn cấp (Kill-Switch)',
    desc: 'Cho phép quản trị viên tạm dừng gửi tin tự động ngay lập tức chỉ với một thao tác khi cần bảo trì hoặc xử lý sự cố kênh liên lạc.',
  },
  {
    icon: '📊',
    title: 'Tầm nhìn vận hành trực quan (Visibility)',
    desc: 'Theo dõi trực quan số lượng hội thoại tiếp nhận, tỷ lệ đơn hợp lệ theo ngưỡng, các trường hợp ngoại lệ cần xử lý và tiến độ của đội ngũ.',
  },
];

export function UnifiedControlSection() {
  return (
    <section className="unified-control-section" id="control" aria-label="Lớp điều hành và kiểm soát chung">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>ĐIỀU HÀNH & KIỂM SOÁT</span>
          </div>

          <h2 className="section-headline">
            Vận hành trên một lớp kiểm soát chung.
          </h2>

          <p className="section-subheadline">
            Không tạo ra các silo công cụ rời rạc. nexagnet cung cấp hạ tầng quản trị đồng nhất giúp doanh nghiệp luôn kiểm soát được dữ liệu, quy tắc và hành động của AI.
          </p>
        </div>

        <div className="control-features-grid">
          {CONTROL_FEATURES.map((item, idx) => (
            <div key={idx} className="control-feature-card">
              <div className="control-icon-wrap">
                <span className="control-icon">{item.icon}</span>
              </div>
              <h3 className="control-title">{item.title}</h3>
              <p className="control-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
