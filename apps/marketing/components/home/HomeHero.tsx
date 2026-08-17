'use client';

import Link from 'next/link';
import { BusinessOperationsMap } from './BusinessOperationsMap';

export function HomeHero() {
  return (
    <section className="hero-section home-hero-operations" aria-label="Khái quát Nền tảng AI nexagnet">
      <div className="container">
        <div className="hero-content">
          {/* Eyebrow */}
          <div className="hero-eyebrow-wrap animate-hero-eyebrow">
            <div className="hero-eyebrow">
              <span className="eyebrow-node" aria-hidden="true" />
              <span className="eyebrow-text">ENTERPRISE AI OPERATIONS</span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="hero-headline animate-hero-headline">
            Điều hành doanh nghiệp
            <br />
            với một lớp AI chung.
          </h1>

          {/* Subheadline */}
          <p className="hero-subheadline animate-hero-subheadline">
            Nexagnet giúp doanh nghiệp đưa AI vào các quy trình giữa khách hàng, nhân viên, dữ liệu và hệ thống — tự động xử lý công việc lặp lại, chuyển ngoại lệ cho con người và tạo một lớp vận hành có kiểm soát.
          </p>

          {/* Action CTAs */}
          <div className="hero-cta-group animate-hero-cta">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Trao đổi về doanh nghiệp của bạn</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cta-arrow-icon">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link href="/platform" className="btn-secondary hero-btn-sub">
              <span>Khám phá nền tảng</span>
            </Link>
          </div>

          {/* Supporting Trust Message */}
          <div className="hero-supporting-copy animate-hero-supporting">
            <span className="supporting-icon" aria-hidden="true">✦</span>
            <span>Bắt đầu từ một quy trình cụ thể. Mở rộng khi doanh nghiệp sẵn sàng.</span>
          </div>

          {/* Central Hero Visual: Business Operations Map */}
          <div className="hero-visual-wrapper">
            <BusinessOperationsMap />
          </div>
        </div>
      </div>
    </section>
  );
}
