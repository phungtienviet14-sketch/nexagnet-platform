'use client';

import React from 'react';
import Link from 'next/link';
import { HeroLocationBadge } from '../shared/HeroLocationBadge';

interface HubHeroProps {
  eyebrow: string;
  badge: string;
  title: string;
  subtitle: string;
  primaryCtaText?: string;
  supportingPill?: string;
}

const DEPT_PILLS = [
  { label: 'Bán hàng (Sales)', href: '/departments/sales', icon: '💼' },
  { label: 'Vận hành (Operations)', href: '/departments/operations', icon: '📦' },
  { label: 'CSKH (Support)', href: '/departments/customer-service', icon: '🎧' },
  { label: 'Marketing', href: '/departments/marketing', icon: '📣' },
  { label: 'Tài chính - Kế toán', href: '/departments/finance', icon: '💳' },
  { label: 'Nhân sự (HR)', href: '/departments/hr', icon: '👥' },
  { label: 'Ban Giám đốc', href: '/departments/executive', icon: '🏛️' },
];

export function HubHero({
  eyebrow = 'HỆ THỐNG PHÒNG BAN DOANH NGHIỆP',
  badge,
  title,
  subtitle,
  primaryCtaText = 'Trao đổi về phòng ban của bạn',
  supportingPill,
}: HubHeroProps) {
  return (
    <section className="hero-section hub-hero-command" aria-label="Tổng quan Phòng ban nexagnet">
      <div className="container">
        {/* Where Am I Location Indicator */}
        <div className="hero-location-wrapper justify-center">
          <HeroLocationBadge
            family="departments"
            categoryLabel={eyebrow}
            currentPage="Tất cả Phòng ban"
            breadcrumbs={[{ label: 'Phòng ban' }]}
            badge={badge}
          />
        </div>

        <div className="hub-hero-header text-center">
          <h1 className="hero-headline animate-hero-headline">{title}</h1>
          <p className="hero-subheadline animate-hero-subheadline mx-auto">{subtitle}</p>

          <div className="hero-cta-group justify-center animate-hero-cta">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>{primaryCtaText}</span>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cta-arrow-icon">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {supportingPill && (
            <div className="hero-supporting-copy justify-center animate-hero-supporting">
              <span className="supporting-icon" aria-hidden="true">✦</span>
              <span>{supportingPill}</span>
            </div>
          )}
        </div>

        {/* Quick Department Interactive Matrix Jump Bar */}
        <div className="hub-dept-matrix-bar animate-hero-visual">
          <div className="matrix-bar-label">CHUYỂN NHANH ĐẾN PHÒNG BAN:</div>
          <div className="matrix-pills-list">
            {DEPT_PILLS.map((dept, idx) => (
              <Link key={idx} href={dept.href} className="matrix-pill-item">
                <span className="matrix-icon">{dept.icon}</span>
                <span className="matrix-text">{dept.label}</span>
                <span className="matrix-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
