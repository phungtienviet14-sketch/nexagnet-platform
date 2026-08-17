'use client';

import Link from 'next/link';
import { ProductExperience } from '../ProductExperience';

export function OrderAutomationHero() {
  return (
    <section className="product-hero-section" aria-label="Order Automation Product Hero">
      <div className="container">
        <div className="breadcrumb-nav">
          <Link href="/" className="back-link">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M10 12.5L5.5 8L10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Quay lại Trang chủ nền tảng</span>
          </Link>
        </div>

        <div className="product-hero-content text-center">
          <div className="section-eyebrow justify-center">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>SẢN PHẨM TIÊU BIỂU · MODULE 01</span>
          </div>

          <h1 className="product-headline">
            Tự động hóa xử lý đơn hàng B2B
            <br />
            từ hội thoại Zalo &amp; đa kênh.
          </h1>

          <p className="product-subheadline">
            Chuyển hóa tin nhắn đặt hàng tự nhiên, viết tắt, không dấu và ảnh chụp bảng kê thành đơn hàng chuẩn hóa. Tự động đối soát SKU, tồn kho và hạn mức công nợ trước khi xác nhận.
          </p>

          <div className="hero-cta-group justify-center">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Yêu cầu Demo Order Automation</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link href="#flow" className="btn-secondary hero-btn-sub">
              <span>Xem luồng xử lý</span>
            </Link>
          </div>

          {/* Interactive Live Product Experience Frame */}
          <div className="product-experience-frame-wrap mt-12">
            <ProductExperience />
          </div>
        </div>
      </div>
    </section>
  );
}
