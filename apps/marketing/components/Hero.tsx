'use client';

import Link from 'next/link';
import { ProductExperience } from './ProductExperience';

export function Hero() {
  return (
    <section className="hero-section" aria-label="Hero Introduction">
      <div className="container">
        <div className="hero-content">
          {/* Eyebrow / Category Tag */}
          <div className="hero-eyebrow-wrap">
            <div className="hero-eyebrow">
              <span className="eyebrow-node" aria-hidden="true" />
              <span className="eyebrow-text">NỀN TẢNG AI VẬN HÀNH DOANH NGHIỆP</span>
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="hero-headline">
            AI cho từng quy trình
            <br />
            vận hành của bạn.
          </h1>

          {/* Subheadline */}
          <p className="hero-subheadline">
            nexagnet là nền tảng AI Agent theo module, giúp doanh nghiệp tự động hóa từng quy trình — từ hội thoại đến các nghiệp vụ vận hành — mà vẫn duy trì quy tắc và quyền kiểm soát.
          </p>

          {/* Call to Actions */}
          <div className="hero-cta-group">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Yêu cầu Demo</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6 3.5L10.5 8L6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            <Link href="#platform" className="btn-secondary hero-btn-sub">
              <span>Khám phá nền tảng</span>
            </Link>
          </div>

          {/* Supporting Trust Copy */}
          <div className="hero-supporting-copy">
            <span className="supporting-icon" aria-hidden="true">✦</span>
            <span>Bắt đầu từ một module. Mở rộng khi doanh nghiệp của bạn sẵn sàng.</span>
          </div>

          {/* Live Product Experience Frame */}
          <div className="hero-product-wrapper">
            <ProductExperience />
          </div>
        </div>
      </div>
    </section>
  );
}
