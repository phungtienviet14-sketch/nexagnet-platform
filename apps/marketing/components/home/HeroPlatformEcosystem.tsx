'use client';

import Link from 'next/link';

export function HeroPlatformEcosystem() {
  return (
    <section className="hero-section home-platform-hero" aria-label="Khái quát Nền tảng AI nexagnet">
      <div className="container">
        <div className="hero-content">
          {/* 1. Eyebrow */}
          <div className="hero-eyebrow-wrap animate-hero-eyebrow">
            <div className="hero-eyebrow">
              <span className="eyebrow-node" aria-hidden="true" />
              <span className="eyebrow-text">NỀN TẢNG AI CHO DOANH NGHIỆP</span>
            </div>
          </div>

          {/* 2. Headline */}
          <h1 className="hero-headline animate-hero-headline">
            Đưa AI vào doanh nghiệp
            <br />
            theo cách phù hợp với bạn.
          </h1>

          {/* 3. Subheadline */}
          <p className="hero-subheadline animate-hero-subheadline">
            nexagnet giúp doanh nghiệp ứng dụng AI vào bán hàng, chăm sóc khách hàng và vận hành — bắt đầu từ một nhu cầu cụ thể và mở rộng theo thời gian mà vẫn duy trì quy tắc và quyền kiểm soát.
          </p>

          {/* 4. Action CTAs */}
          <div className="hero-cta-group animate-hero-cta">
            <Link href="#demo" className="btn-primary hero-btn-main">
              <span>Yêu cầu Demo</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="cta-arrow-icon">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link href="/platform" className="btn-secondary hero-btn-sub">
              <span>Khám phá Nền tảng</span>
            </Link>
          </div>

          {/* 5. Supporting Trust Copy */}
          <div className="hero-supporting-copy animate-hero-supporting">
            <span className="supporting-icon" aria-hidden="true">✦</span>
            <span>Bắt đầu từ một quy trình. Mở rộng khi doanh nghiệp của bạn sẵn sàng.</span>
          </div>

          {/* 6. Abstract Platform Constellation Visual */}
          <div className="platform-ecosystem-visual animate-hero-visual">
            <div className="ecosystem-frame">
              {/* Header Chrome */}
              <div className="eco-chrome-bar">
                <div className="eco-dots">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                  <span className="eco-title">nexagnet Enterprise AI Platform</span>
                </div>
                <div className="eco-badge">Kiến trúc AI theo Module</div>
              </div>

              {/* Ecosystem Diagram */}
              <div className="eco-diagram-body">
                {/* Top Nodes: Applications */}
                <div className="eco-top-nodes">
                  <Link href="/solutions/sales" className="eco-app-card sales-node">
                    <div className="node-icon">💼</div>
                    <div className="node-info">
                      <span className="node-name">Bán hàng</span>
                      <span className="node-hint">Tiếp nhận &amp; Báo giá</span>
                    </div>
                  </Link>

                  <Link href="/solutions/customer-service" className="eco-app-card cs-node">
                    <div className="node-icon">💬</div>
                    <div className="node-info">
                      <span className="node-name">Chăm sóc Khách hàng</span>
                      <span className="node-hint">24/7 &amp; Trích dẫn chuẩn</span>
                    </div>
                  </Link>

                  <Link href="/solutions/operations" className="eco-app-card ops-node">
                    <div className="node-icon">⚙️</div>
                    <div className="node-info">
                      <span className="node-name">Vận hành Nội bộ</span>
                      <span className="node-hint">Quy trình &amp; Phê duyệt</span>
                    </div>
                  </Link>
                </div>

                {/* Connection Bridge */}
                <div className="eco-connectors">
                  <div className="connector-line"><span className="flow-pulse" /></div>
                  <div className="connector-line"><span className="flow-pulse" /></div>
                  <div className="connector-line"><span className="flow-pulse" /></div>
                </div>

                {/* Central Platform Engine */}
                <div className="eco-central-platform">
                  <div className="platform-core-box">
                    <div className="core-motif">
                      <span className="core-dot" />
                    </div>
                    <div className="core-texts">
                      <h4 className="core-title">Nền tảng Điều phối nexagnet</h4>
                      <p className="core-subtitle">Trích xuất ngôn ngữ · Phân luồng tác vụ · Giao tiếp đa kênh</p>
                    </div>
                  </div>
                </div>

                {/* Lower Layer: Governance & Control */}
                <div className="eco-bottom-layer">
                  <div className="gov-pillar">
                    <span className="gov-icon">🗄️</span>
                    <span>Nguồn sự thật</span>
                  </div>
                  <div className="gov-sep">·</div>
                  <div className="gov-pillar">
                    <span className="gov-icon">⚖️</span>
                    <span>Rules Engine tất định</span>
                  </div>
                  <div className="gov-sep">·</div>
                  <div className="gov-pillar">
                    <span className="gov-icon">🛡️</span>
                    <span>Kiểm duyệt nhân sự</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
