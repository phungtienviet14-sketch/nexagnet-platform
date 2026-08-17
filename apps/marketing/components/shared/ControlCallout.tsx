'use client';

import Link from 'next/link';

interface ControlCalloutProps {
  title?: string;
  desc?: string;
  primaryLinkHref?: string;
  primaryLinkText?: string;
}

export function ControlCallout({
  title = 'AI mạnh mẽ hơn khi doanh nghiệp luôn giữ quyền kiểm soát.',
  desc = 'Mọi dữ liệu đầu ra từ nexagnet đều được ràng buộc bởi bảng giá, chính sách thương mại và cổng kiểm duyệt của nhân sự. Không bao giờ để AI tự quyết định thay bạn.',
  primaryLinkHref = '/platform/control',
  primaryLinkText = 'Tìm hiểu về Kiểm soát & Quản trị AI',
}: ControlCalloutProps) {
  return (
    <section className="control-callout-section" aria-label="Kiểm soát và an toàn">
      <div className="container">
        <div className="control-callout-card">
          <div className="callout-content-wrap">
            <div className="callout-badge">
              <span className="callout-dot" />
              <span>KIỂM SOÁT &amp; AN TOÀN DOANH NGHIỆP</span>
            </div>

            <h3 className="callout-title">{title}</h3>
            <p className="callout-desc">{desc}</p>

            <div className="callout-pillars-row">
              <div className="pillar-pill">✓ Nguồn sự thật doanh nghiệp</div>
              <div className="pillar-pill">✓ Rules Engine tính toán độc lập</div>
              <div className="pillar-pill">✓ Kiểm duyệt nhân sự (Human-in-the-Loop)</div>
            </div>

            <div className="callout-action-wrap">
              <Link href={primaryLinkHref} className="btn-secondary callout-btn">
                <span>{primaryLinkText}</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
