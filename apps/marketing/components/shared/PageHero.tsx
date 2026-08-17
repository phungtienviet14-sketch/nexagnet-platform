'use client';

import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeroProps {
  breadcrumbs: BreadcrumbItem[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCtaText?: string;
  primaryCtaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  badge?: string;
  supportingPill?: string;
}

export function PageHero({
  breadcrumbs,
  eyebrow,
  title,
  subtitle,
  primaryCtaText = 'Yêu cầu Demo',
  primaryCtaHref = '#demo',
  secondaryCtaText,
  secondaryCtaHref,
  badge,
  supportingPill,
}: PageHeroProps) {
  return (
    <section className="page-hero-section" aria-label={title}>
      <div className="container">
        {/* Breadcrumb Navigation */}
        <nav className="hero-breadcrumbs" aria-label="Breadcrumb">
          <ol className="breadcrumbs-list">
            <li>
              <Link href="/" className="breadcrumb-link">
                Trang chủ
              </Link>
            </li>
            {breadcrumbs.map((b, idx) => (
              <li key={idx} className="breadcrumb-item">
                <span className="breadcrumb-sep">/</span>
                {b.href ? (
                  <Link href={b.href} className="breadcrumb-link">
                    {b.label}
                  </Link>
                ) : (
                  <span className="breadcrumb-current" aria-current="page">
                    {b.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* Hero Content */}
        <div className="page-hero-content">
          <div className="page-hero-eyebrow-wrap">
            <div className="section-eyebrow">
              <span className="section-eyebrow-dot" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>
            {badge && <span className="hero-status-pill">{badge}</span>}
          </div>

          <h1 className="page-hero-title">{title}</h1>

          <p className="page-hero-subtitle">{subtitle}</p>

          <div className="page-hero-cta-group">
            <Link href={primaryCtaHref} className="btn-primary">
              <span>{primaryCtaText}</span>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            {secondaryCtaText && secondaryCtaHref && (
              <Link href={secondaryCtaHref} className="btn-secondary">
                <span>{secondaryCtaText}</span>
              </Link>
            )}
          </div>

          {supportingPill && (
            <div className="hero-trust-note">
              <span className="trust-icon" aria-hidden="true">✦</span>
              <span>{supportingPill}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
