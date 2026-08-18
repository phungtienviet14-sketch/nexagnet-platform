'use client';

import Link from 'next/link';
import { NexagnetIcon } from '@/components/shared/EnterpriseIcons';

interface SolutionPillar {
  iconKey: string;
  title: string;
  desc: string;
  href: string;
  tags: string[];
}

const PILLARS: SolutionPillar[] = [
  {
    iconKey: 'sales',
    title: 'Bán hàng & Phân phối',
    desc: 'Hỗ trợ đội ngũ kinh doanh tiếp nhận yêu cầu, tra cứu giá đại lý và soạn đơn nhanh chóng, chính xác.',
    href: '/solutions/sales',
    tags: ['Tiếp nhận báo giá', 'Bóc tách đơn hàng', 'Tra cứu tồn kho'],
  },
  {
    iconKey: 'customer-service',
    title: 'Chăm sóc Khách hàng',
    desc: 'Giải đáp thắc mắc 24/7 theo tài liệu duyệt, đảm bảo câu trả lời nhất quán và chuyển giao nhân sự mượt mà.',
    href: '/solutions/customer-service',
    tags: ['Trích dẫn chính sách', 'Giải đáp kỹ thuật', 'Bàn giao chuyên viên'],
  },
  {
    iconKey: 'operations',
    title: 'Vận hành Doanh nghiệp',
    desc: 'Tự động hóa các tác vụ lặp lại, đối soát dữ liệu và phân luồng an toàn qua các chốt chặn kiểm duyệt.',
    href: '/solutions/operations',
    tags: ['Rules Engine', 'Phê duyệt đa cấp', 'Nhật ký kiểm toán'],
  },
];

export function HomeSolutionsOverview() {
  return (
    <section className="home-solutions-section" aria-label="Lĩnh vực ứng dụng">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>LĨNH VỰC ỨNG DỤNG</span>
          </div>

          <h2 className="section-headline">
            Một nền tảng AI cho nhiều nhu cầu doanh nghiệp.
          </h2>

          <p className="section-subheadline">
            Doanh nghiệp có thể bắt đầu từ một bài toán bức thiết nhất trong bán hàng, chăm sóc khách hàng hoặc vận hành nội bộ, sau đó mở rộng sang các phòng ban khác trên cùng một hạ tầng.
          </p>
        </div>

        <div className="solutions-cards-grid">
          {PILLARS.map((p, idx) => (
            <div key={idx} className="solution-pillar-card">
              <div className="pillar-icon-box">
                <NexagnetIcon name={p.iconKey} size={24} containerStyle="subtle" />
              </div>
              <h3 className="pillar-title">{p.title}</h3>
              <p className="pillar-desc">{p.desc}</p>

              <div className="pillar-tags-list">
                {p.tags.map((t, tIdx) => (
                  <span key={tIdx} className="pillar-tag-pill">
                    {t}
                  </span>
                ))}
              </div>

              <div className="pillar-action">
                <Link href={p.href} className="pillar-link">
                  <span>Khám phá giải pháp</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
