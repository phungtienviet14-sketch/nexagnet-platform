'use client';

import React from 'react';
import Link from 'next/link';
import { HeroLocationBadge } from '../shared/HeroLocationBadge';
import { NexagnetIcon } from '../shared/EnterpriseIcons';

interface HubHeroProps {
  eyebrow?: string;
  badge?: string;
  title: string;
  subtitle: string;
  primaryCtaText?: string;
  supportingPill?: string;
}

const DEPT_PILLS = [
  { label: 'Bán hàng (Sales)', href: '/departments/sales', iconKey: 'sales' },
  { label: 'Vận hành (Operations)', href: '/departments/operations', iconKey: 'operations' },
  { label: 'CSKH (Support)', href: '/departments/customer-service', iconKey: 'customer-service' },
  { label: 'Marketing', href: '/departments/marketing', iconKey: 'marketing' },
  { label: 'Tài chính - Kế toán', href: '/departments/finance', iconKey: 'finance' },
  { label: 'Nhân sự (HR)', href: '/departments/hr', iconKey: 'hr' },
  { label: 'Ban Giám đốc', href: '/departments/executive', iconKey: 'executive' },
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

        {/* Centered Command Hierarchy */}
        <div className="hero-content-centered">
          <h1 className="hero-headline text-center max-w-4xl mx-auto animate-hero-headline">
            {title}
          </h1>

          <p className="hero-subheadline text-center max-w-3xl mx-auto animate-hero-subheadline">
            {subtitle}
          </p>

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
                <span className="matrix-icon">
                  <NexagnetIcon name={dept.iconKey} size={16} containerStyle="naked" />
                </span>
                <span className="matrix-text">{dept.label}</span>
                <span className="matrix-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
