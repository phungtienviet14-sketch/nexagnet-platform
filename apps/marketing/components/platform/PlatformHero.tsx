'use client';

import React from 'react';
import Link from 'next/link';
import { HeroLocationBadge, type BreadcrumbItem } from '../shared/HeroLocationBadge';

interface PlatformHeroProps {
  eyebrow?: string;
  badge?: string;
  title: string;
  subtitle: string;
  primaryCtaText?: string;
  primaryCtaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
  supportingPill?: string;
  breadcrumbs?: BreadcrumbItem[];
  visual?: React.ReactNode;
}

export function PlatformHero({
  eyebrow = 'KIẾN TRÚC KỸ THUẬT NỀN TẢNG',
  badge,
  title,
  subtitle,
  primaryCtaText = 'Yêu cầu Tư vấn Kiến trúc',
  primaryCtaHref = '#demo',
  secondaryCtaText = 'Xem chi tiết Kiểm soát',
  secondaryCtaHref = '/platform/control',
  supportingPill,
  breadcrumbs = [],
  visual,
}: PlatformHeroProps) {
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1]?.label || title;

  return (
    <section className="hero-section platform-hero-tech" aria-label={title}>
      <div className="container">
        {/* Where Am I Location Indicator */}
        <div className="hero-location-wrapper">
          <HeroLocationBadge
            family="platform"
            categoryLabel={eyebrow}
            currentPage={currentCrumb}
            breadcrumbs={breadcrumbs}
            badge={badge}
          />
        </div>

        <div className="platform-hero-grid">
          {/* Left Column: Architecture Context */}
          <div className="hero-text-col">
            <h1 className="hero-headline animate-hero-headline">{title}</h1>

            <p className="hero-subheadline animate-hero-subheadline">{subtitle}</p>

            <div className="hero-cta-group animate-hero-cta">
              <Link href={primaryCtaHref} className="btn-primary hero-btn-main">
                <span>{primaryCtaText}</span>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cta-arrow-icon">
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              {secondaryCtaText && secondaryCtaHref && (
                <Link href={secondaryCtaHref} className="btn-secondary hero-btn-sub">
                  <span>{secondaryCtaText}</span>
                </Link>
              )}
            </div>

            {supportingPill && (
              <div className="hero-supporting-copy animate-hero-supporting">
                <span className="supporting-icon" aria-hidden="true">✦</span>
                <span>{supportingPill}</span>
              </div>
            )}
          </div>

          {/* Right Column: Technical Architecture Visual */}
          {visual && (
            <div className="hero-visual-col animate-hero-visual">
              <div className="hero-visual-shell">
                {visual}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
