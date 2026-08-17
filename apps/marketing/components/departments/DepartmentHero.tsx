'use client';

import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DepartmentHeroProps {
  breadcrumbs: BreadcrumbItem[];
  eyebrow: string;
  badge: string;
  title: string;
  subtitle: string;
  primaryCtaText?: string;
  supportingPill?: string;
}

export function DepartmentHero({
  breadcrumbs,
  eyebrow,
  badge,
  title,
  subtitle,
  primaryCtaText = 'Trao đổi về phòng ban của bạn',
  supportingPill,
}: DepartmentHeroProps) {
  return (
    <section className="page-hero-section department-hero-root">
      <div className="container">
        <div className="page-hero-inner">
          {/* Breadcrumb Trail */}
          <nav className="breadcrumb-nav" aria-label="Đường dẫn phân cấp">
            <ol className="breadcrumb-list">
              <li>
                <Link href="/" className="breadcrumb-link">Trang chủ</Link>
                <span className="breadcrumb-sep">/</span>
              </li>
              {breadcrumbs.map((item, index) => (
                <li key={index}>
                  {item.href ? (
                    <>
                      <Link href={item.href} className="breadcrumb-link">{item.label}</Link>
                      <span className="breadcrumb-sep">/</span>
                    </>
                  ) : (
                    <span className="breadcrumb-current" aria-current="page">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          {/* Eyebrow & Badge */}
          <div className="page-hero-eyebrow-row">
            <div className="page-hero-eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>
            {badge && <span className="page-hero-badge">{badge}</span>}
          </div>

          {/* Title & Subtitle */}
          <h1 className="page-hero-title">{title}</h1>
          <p className="page-hero-subtitle">{subtitle}</p>

          {/* Action CTAs */}
          <div className="page-hero-cta-group">
            <Link href="#demo" className="btn-primary">
              <span>{primaryCtaText}</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/departments" className="btn-secondary">
              <span>Tất cả phòng ban</span>
            </Link>
          </div>

          {/* Supporting Trust Pill */}
          {supportingPill && (
            <div className="page-hero-supporting-pill">
              <span className="pill-spark" aria-hidden="true">✦</span>
              <span>{supportingPill}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
