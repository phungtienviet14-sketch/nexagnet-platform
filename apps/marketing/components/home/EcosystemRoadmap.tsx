'use client';

interface RoadmapCard {
  tag: string;
  title: string;
  desc: string;
  status: 'available' | 'expanding' | 'future';
}

const ROADMAP_ITEMS: RoadmapCard[] = [
  {
    tag: 'HỘI THOẠI & ĐƠN HÀNG B2B',
    title: 'Xử lý đơn & Tri thức từ hội thoại',
    desc: 'Bóc tách tin nhắn tự nhiên, ánh xạ SKU đóng, đối soát quy tắc kinh doanh và tự động phân luồng duyệt.',
    status: 'available',
  },
  {
    tag: 'TÙY CHỌN TÍCH HỢP HỆ THỐNG',
    title: 'Kết nối 2 chiều ERP & CRM qua cổng ErpPort',
    desc: 'Kiến trúc sẵn sàng kết nối API/Webhook với KiotViet, SAP, Bravo, Base, MISA cho các giai đoạn mở rộng.',
    status: 'expanding',
  },
  {
    tag: 'KÊNH THOẠI & CSKH',
    title: 'Voice AI & Tổng đài thông minh',
    desc: 'Đang phát triển năng lực tiếp nhận cuộc gọi tự động, phân loại ý định và chuyển tiếp nhân sự.',
    status: 'expanding',
  },
  {
    tag: 'PHÂN TÍCH & BÁO CÁO',
    title: 'Báo cáo hiệu suất & Xu hướng vận hành',
    desc: 'Roadmap phân tích tỷ lệ đơn tự động, tần suất đặt hàng theo nhóm đối tác và các trường hợp ngoại lệ.',
    status: 'future',
  },
  {
    tag: 'MỞ RỘNG QUY TRÌNH',
    title: 'Custom Workflow Builder',
    desc: 'Kiến trúc sẵn sàng mở rộng cho phép định nghĩa thêm các luồng quy tắc nghiệp vụ chuyên biệt.',
    status: 'future',
  },
];

export function EcosystemRoadmap() {
  return (
    <section className="ecosystem-section" id="ecosystem" aria-label="Lộ trình phát triển hệ sinh thái">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>ĐỊNH HƯỚNG PHÁT TRIỂN</span>
          </div>

          <h2 className="section-headline">
            Hệ sinh thái đang mở rộng
            <br />
            cùng doanh nghiệp của bạn.
          </h2>

          <p className="section-subheadline">
            nexagnet được thiết kế theo kiến trúc module hóa từ gốc. Nền tảng liên tục phát triển thêm các năng lực mới, giúp doanh nghiệp an tâm mở rộng quy mô mà không phải đổi mới công nghệ.
          </p>
        </div>

        <div className="roadmap-cards-grid">
          {ROADMAP_ITEMS.map((item, idx) => (
            <div key={idx} className="roadmap-card">
              <div className="roadmap-card-top">
                <span className="roadmap-tag">{item.tag}</span>
                <span className={`roadmap-status-pill ${item.status}`}>
                  {item.status === 'available' && '● Đang chạy thực tế'}
                  {item.status === 'expanding' && '◐ Đang mở rộng'}
                  {item.status === 'future' && '○ Định hướng'}
                </span>
              </div>
              <h3 className="roadmap-title">{item.title}</h3>
              <p className="roadmap-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
