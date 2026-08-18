'use client';

import React from 'react';
import Link from 'next/link';
import { HeroLocationBadge, type BreadcrumbItem } from '../shared/HeroLocationBadge';

interface ResourceHeroProps {
  eyebrow?: string;
  badge?: string;
  title: string;
  subtitle: string;
  primaryCtaText?: string;
  primaryCtaHref?: string;
  supportingPill?: string;
  breadcrumbs?: BreadcrumbItem[];
  interactiveBar?: React.ReactNode;
}

export function ResourceHero({
  eyebrow = 'TÀI NGUYÊN & GIẢI ĐÁP NỀN TẢNG',
  badge,
  title,
  subtitle,
  primaryCtaText = 'Gửi câu hỏi cho chuyên gia',
  primaryCtaHref = '#demo',
  supportingPill,
  breadcrumbs = [],
  interactiveBar,
}: ResourceHeroProps) {
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1]?.label || title;

  return (
    <section className="hero-section resource-hero-editorial" aria-label={title}>
      <div className="container">
        {/* Where Am I Location Indicator */}
        <div className="hero-location-wrapper">
          <HeroLocationBadge
            family="resources"
            categoryLabel={eyebrow}
            currentPage={currentCrumb}
            breadcrumbs={breadcrumbs}
            badge={badge}
          />
        </div>

        <div className="resource-hero-inner text-left">
          <div className="resource-headline-wrap">
            <h1 className="hero-headline animate-hero-headline">{title}</h1>
            <p className="hero-subheadline animate-hero-subheadline">{subtitle}</p>
          </div>

          <div className="hero-cta-group animate-hero-cta">
            <Link href={primaryCtaHref} className="btn-primary hero-btn-main">
              <span>{primaryCtaText}</span>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cta-arrow-icon">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link href="/resources/roadmap" className="btn-secondary hero-btn-sub">
              <span>Xem lộ trình phát triển</span>
            </Link>
          </div>

          {supportingPill && (
            <div className="hero-supporting-copy animate-hero-supporting">
              <span className="supporting-icon" aria-hidden="true">✦</span>
              <span>{supportingPill}</span>
            </div>
          )}

          {interactiveBar && (
            <div className="resource-interactive-slot animate-hero-visual">
              {interactiveBar}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
