'use client';

import Link from 'next/link';
import { INDUSTRIES_DATA } from '../data/industries';

export function IndustrySolutionsGrid() {
  return (
    <section className="industries-section" id="industries" aria-label="Giải pháp AI Agent theo ngành">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>GIẢI PHÁP THEO NGÀNH NGHỀ</span>
          </div>

          <h2 className="section-headline">
            Mỗi ngành một đặc thù.
            <br />
            Một nền tảng AI được may đo chuẩn xác.
          </h2>

          <p className="section-subheadline">
            Từ tư vấn dự án bất động sản, chăm sóc sắc đẹp, đến xử lý đơn hàng bán buôn đa kênh phức tạp — nexagnet được tinh chỉnh theo bài toán thực tế của từng lĩnh vực.
          </p>
        </div>

        {/* Industry Cards Grid */}
        <div className="industry-cards-grid">
          {INDUSTRIES_DATA.map((ind) => (
            <div key={ind.slug} className="industry-card">
              <div className="ind-card-top">
                <div className="ind-icon-box">{ind.icon}</div>
                <div className="ind-badge-wrap">
                  <span className="ind-status-tag">Sẵn sàng triển khai</span>
                </div>
              </div>

              <h3 className="ind-card-title">{ind.title}</h3>
              <p className="ind-card-subtitle">{ind.subtitle}</p>

              <div className="ind-benefits-list">
                {ind.keyBenefits.slice(0, 3).map((benefit, bIdx) => (
                  <div key={bIdx} className="ind-benefit-item">
                    <span className="benefit-check">✓</span>
                    <span className="benefit-text">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="ind-metric-banner">
                <span className="metric-num">{ind.metrics[0]?.value}</span>
                <span className="metric-text">{ind.metrics[0]?.label}</span>
              </div>

              <div className="ind-card-action">
                <Link href={`/solutions/${ind.slug}`} className="ind-learn-more-btn">
                  <span>Khám phá giải pháp {ind.title}</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Callout for custom industries */}
        <div className="custom-industry-banner">
          <div className="banner-left">
            <span className="banner-badge">DOANH NGHIỆP CÓ QUY TRÌNH ĐẶC THÙ?</span>
            <h4 className="banner-title">Cần tích hợp AI cho mô hình kinh doanh riêng của bạn?</h4>
            <p className="banner-desc">
              Kiến trúc mở của nexagnet cho phép kết nối linh hoạt với ERP (KiotViet, SAP, Base, Bravo), CRM và các luồng quy tắc tùy chỉnh theo từng doanh nghiệp.
            </p>
          </div>
          <div className="banner-right">
            <Link href="#demo" className="btn-primary">
              <span>Đăng ký tư vấn giải pháp riêng</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
