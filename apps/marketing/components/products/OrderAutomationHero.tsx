'use client';

import React from 'react';
import Link from 'next/link';
import { HeroLocationBadge } from '../shared/HeroLocationBadge';
import { ProductExperience } from '../ProductExperience';

export function OrderAutomationHero() {
  return (
    <section className="hero-section product-hero-interactive flagship-hero" aria-label="Order Automation Product Hero">
      <div className="container">
        {/* Where Am I Location Indicator */}
        <div className="hero-location-wrapper justify-center">
          <HeroLocationBadge
            family="products"
            categoryLabel="SẢN PHẨM"
            currentPage="Order Automation (Module 01)"
            breadcrumbs={[{ label: 'Sản phẩm', href: '/#products' }, { label: 'Order Automation' }]}
            badge="FLAGSHIP MODULE 01"
          />
        </div>

        <div className="product-hero-header text-center">
          <h1 className="hero-headline animate-hero-headline">
            Tự động hóa xử lý đơn hàng B2B
            <br />
            từ hội thoại Zalo &amp; đa kênh.
          </h1>

          <p className="hero-subheadline animate-hero-subheadline mx-auto">
            Chuyển hóa tin nhắn đặt hàng tự nhiên, viết tắt, không dấu và ảnh chụp bảng kê thành đơn hàng chuẩn hóa. Tự động đối soát SKU, tồn kho và hạn mức công nợ trước khi xác nhận.
          </p>

          <div className="hero-cta-group justify-center animate-hero-cta">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Yêu cầu Demo Order Automation</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cta-arrow-icon">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link href="#flow" className="btn-secondary hero-btn-sub">
              <span>Xem luồng xử lý</span>
            </Link>
          </div>

          <div className="hero-supporting-copy justify-center animate-hero-supporting">
            <span className="supporting-icon" aria-hidden="true">✦</span>
            <span>Bóc tách 3s/đơn · 100% Rules Engine tất định · Giám sát Human-in-the-Loop</span>
          </div>

          {/* Interactive Live Product Experience Frame */}
          <div className="product-experience-frame-wrap mt-10 animate-hero-visual">
            <ProductExperience />
          </div>
        </div>
      </div>
    </section>
  );
}
