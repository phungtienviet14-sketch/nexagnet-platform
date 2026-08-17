'use client';

import Link from 'next/link';

interface IndustryItem {
  icon: string;
  title: string;
  desc: string;
  href: string;
}

const INDUSTRIES: IndustryItem[] = [
  {
    icon: '📦',
    title: 'Bán lẻ & Phân phối',
    desc: 'Xử lý đơn hàng qua nhóm Zalo, tra cứu bảng giá theo cấp đại lý và quản lý mạng lưới cộng tác viên.',
    href: '/industries/retail-distribution',
  },
  {
    icon: '💆',
    title: 'Spa & Thẩm mỹ',
    desc: 'Tư vấn thông tin dịch vụ, tiếp nhận nhu cầu làm đẹp, hỗ trợ đặt lịch và nhắc lịch hẹn tự động.',
    href: '/industries/spa-beauty',
  },
  {
    icon: '🏢',
    title: 'Bất động sản',
    desc: 'Giải đáp thông tin quy hoạch, bảng hàng dự án, phân loại khách tiềm năng và chuyển giao môi giới.',
    href: '/industries/real-estate',
  },
  {
    icon: '🎓',
    title: 'Giáo dục & Đào tạo',
    desc: 'Tư vấn lộ trình học, giải đáp thắc mắc tuyển sinh và kết nối tư vấn viên chuyên trách.',
    href: '/industries/education',
  },
  {
    icon: '🏨',
    title: 'Khách sạn & Dịch vụ',
    desc: 'Tiếp nhận yêu cầu phòng, giải đáp tiện ích dịch vụ và chăm sóc khách hàng 24/7.',
    href: '/industries/hospitality',
  },
];

export function HomeIndustriesSection() {
  return (
    <section className="home-industries-section" aria-label="Ứng dụng theo ngành">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>ỨNG DỤNG THEO NGÀNH</span>
          </div>

          <h2 className="section-headline">
            AI được áp dụng khác nhau ở mỗi ngành.
          </h2>

          <p className="section-subheadline">
            Mỗi lĩnh vực kinh doanh có thói quen giao tiếp và bài toán vận hành riêng biệt. nexagnet được cấu hình linh hoạt theo đặc thù từng ngành nghề.
          </p>
        </div>

        <div className="industries-cards-grid">
          {INDUSTRIES.map((ind, idx) => (
            <Link key={idx} href={ind.href} className="industry-hub-card">
              <div className="ind-card-icon">{ind.icon}</div>
              <h3 className="ind-card-title">{ind.title}</h3>
              <p className="ind-card-desc">{ind.desc}</p>
              <div className="ind-card-arrow">
                <span>Xem giải pháp ngành</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
