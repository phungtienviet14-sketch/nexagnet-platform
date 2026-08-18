'use client';

import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export type PageFamily = 'departments' | 'industries' | 'products' | 'platform' | 'resources' | 'legal';

interface HeroLocationBadgeProps {
  family: PageFamily;
  categoryLabel: string;
  currentPage: string;
  breadcrumbs?: BreadcrumbItem[];
  badge?: string;
}

const FAMILY_CONFIG: Record<PageFamily, { tag: string; accentClass: string }> = {
  departments: { tag: 'PHÒNG BAN', accentClass: 'accent-departments' },
  industries: { tag: 'NGÀNH NGHỀ', accentClass: 'accent-industries' },
  products: { tag: 'SẢN PHẨM', accentClass: 'accent-products' },
  platform: { tag: 'NỀN TẢNG', accentClass: 'accent-platform' },
  resources: { tag: 'TÀI NGUYÊN', accentClass: 'accent-resources' },
  legal: { tag: 'PHÁP LÝ & BẢO MẬT', accentClass: 'accent-legal' },
};

export function HeroLocationBadge({
  family,
  categoryLabel,
  currentPage,
  breadcrumbs = [],
  badge,
}: HeroLocationBadgeProps) {
  const config = FAMILY_CONFIG[family] || FAMILY_CONFIG.departments;

  return (
    <div className={`hero-location-bar ${config.accentClass}`}>
      {/* Category Eyebrow & Live Pulse */}
      <div className="location-pill">
        <span className="location-pulse" aria-hidden="true" />
        <span className="location-category">{config.tag}</span>
        <span className="location-divider" aria-hidden="true">/</span>
        <span className="location-current">{categoryLabel || currentPage}</span>
      </div>

      {/* Structured Breadcrumbs Trail */}
      {breadcrumbs.length > 0 && (
        <nav className="hero-breadcrumbs-trail" aria-label="Đường dẫn phân cấp">
          <ol className="breadcrumbs-inline-list">
            <li>
              <Link href="/" className="crumb-link">
                Trang chủ
              </Link>
            </li>
            {breadcrumbs.map((crumb, idx) => (
              <li key={idx} className="crumb-item">
                <span className="crumb-sep" aria-hidden="true">/</span>
                {crumb.href ? (
                  <Link href={crumb.href} className="crumb-link">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="crumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {badge && <span className="hero-status-pill">{badge}</span>}
    </div>
  );
}
