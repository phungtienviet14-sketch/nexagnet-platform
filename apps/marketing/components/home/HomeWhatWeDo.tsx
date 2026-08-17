'use client';

import {
  IconAIProcessor,
  IconRulesEngine,
  IconOperations,
  IconHumanGate,
} from '@/components/shared/EnterpriseIcons';

interface CapabilityItem {
  num: string;
  badge: string;
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;
  details: string[];
}

const HIGH_LEVEL_CAPABILITIES: CapabilityItem[] = [
  {
    num: '01',
    badge: 'UNDERSTAND',
    title: 'Hiểu dữ liệu và ngữ cảnh đầu vào',
    desc: 'AI tiếp nhận và đọc hiểu tin nhắn hội thoại tự nhiên (kể cả viết tắt, không dấu), tài liệu, biểu mẫu và dữ liệu từ nhiều điểm chạm khách hàng.',
    Icon: IconAIProcessor,
    details: [
      'Đọc hiểu ngôn ngữ tự nhiên và tiếng lóng ngành',
      'Trích xuất thực thể theo danh mục mã chuẩn',
      'Loại bỏ nhiễu và lọc đúng ý định nghiệp vụ',
    ],
  },
  {
    num: '02',
    badge: 'DECIDE WITH CONTEXT',
    title: 'Quyết định với tri thức & quy tắc doanh nghiệp',
    desc: 'Không để AI tự suy đoán tự do. Mọi phép tính tiền, thuế, chiết khấu, hạn mức công nợ và điều kiện phê duyệt đều do quy tắc tất định thực thi từ Nguồn sự thật.',
    Icon: IconRulesEngine,
    details: [
      'Áp dụng chính sách theo từng hồ sơ đối tác',
      'Tính toán chính xác 100% không có sai số',
      'Đồng bộ tức thời với cơ sở dữ liệu doanh nghiệp',
    ],
  },
  {
    num: '03',
    badge: 'ORCHESTRATE',
    title: 'Điều phối luồng công việc liên phòng ban',
    desc: 'Tác vụ được tự động phân luồng và luân chuyển nhịp nhàng giữa AI, các hệ thống phần mềm và đội ngũ nhân sự chuyên trách.',
    Icon: IconOperations,
    details: [
      'Giao việc tới đúng bộ phận phụ trách',
      'Gắn thẻ trạng thái minh bạch cho từng quy trình',
      'Chống nghẽn việc và theo dõi tiến độ thời gian thực',
    ],
  },
  {
    num: '04',
    badge: 'CONTROL',
    title: 'Con người luôn kiểm soát ngoại lệ quan trọng',
    desc: 'Hệ thống thiết lập ngưỡng an toàn linh hoạt: Tác vụ chuẩn trong hạn mức được tự động hóa; các trường hợp vượt hạn mức hoặc ngoại lệ luôn chuyển giao cho con người phê duyệt.',
    Icon: IconHumanGate,
    details: [
      'Cổng kiểm duyệt Human-in-the-Loop cho nhân sự',
      'Nhật ký kiểm toán lưu vết 100% mọi quyết định',
      'Công tắc dừng khẩn cấp trong 1 click khi cần',
    ],
  },
];

export function HomeWhatWeDo() {
  return (
    <section className="home-what-we-do-section" aria-label="Năng lực nền tảng Nexagnet">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span className="mono-label">NĂNG LỰC NỀN TẢNG</span>
          </div>

          <h2 className="section-headline">
            Biến quy trình doanh nghiệp
            <br />
            thành các luồng công việc có AI hỗ trợ.
          </h2>

          <p className="section-subheadline">
            Nexagnet kết hợp khả năng đọc hiểu ngôn ngữ tự nhiên của AI với logic quy tắc nghiệp vụ tất định và quyền kiểm soát tối thượng của con người.
          </p>
        </div>

        {/* 4 Pillars Sequential Engine Grid */}
        <div className="capabilities-four-grid">
          {HIGH_LEVEL_CAPABILITIES.map((cap) => {
            const { Icon } = cap;
            return (
              <div key={cap.num} className="capability-pillar-card">
                <div className="pillar-card-top">
                  <span className="pillar-num">{cap.num}</span>
                  <div className="pillar-icon-box">
                    <Icon size={22} color="var(--brand-accent)" />
                  </div>
                </div>

                <div className="pillar-badge-tag">{cap.badge}</div>
                <h3 className="pillar-title">{cap.title}</h3>
                <p className="pillar-desc">{cap.desc}</p>

                <ul className="pillar-details-list">
                  {cap.details.map((d, idx) => (
                    <li key={idx} className="pillar-detail-item">
                      <span className="detail-check-glyph" aria-hidden="true">✓</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
