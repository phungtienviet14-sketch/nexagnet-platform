'use client';

import Link from 'next/link';

interface RelatedItem {
  title: string;
  desc: string;
  href: string;
  badge?: string;
}

interface RelatedModulesProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  items: RelatedItem[];
}

export function RelatedModules({
  eyebrow = 'HỆ SINH THÁI LIÊN QUAN',
  title = 'Khám phá các phân hệ bổ trợ khác',
  subtitle = 'nexagnet được xây dựng theo kiến trúc module mở rộng. Bạn có thể bắt đầu từ một giải pháp và kết nối thêm các module tiếp theo.',
  items,
}: RelatedModulesProps) {
  return (
    <section className="related-modules-section" aria-label="Các phân hệ liên quan">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h2 className="section-headline">{title}</h2>

          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="related-grid">
          {items.map((it, idx) => (
            <Link key={idx} href={it.href} className="related-card">
              <div className="related-card-top">
                <h3 className="related-card-title">{it.title}</h3>
                {it.badge && <span className="related-card-badge">{it.badge}</span>}
              </div>
              <p className="related-card-desc">{it.desc}</p>
              <div className="related-card-cta">
                <span>Tìm hiểu chi tiết</span>
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
