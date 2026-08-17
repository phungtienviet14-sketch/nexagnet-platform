'use client';

import Link from 'next/link';

export function FeaturedProductBridge() {
  return (
    <section className="featured-bridge-section" aria-label="Sản phẩm tiêu biểu">
      <div className="container">
        <div className="featured-bridge-card">
          <div className="bridge-grid">
            {/* Left: Product Information & Value Props */}
            <div className="bridge-info-col">
              <div className="section-eyebrow">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>SẢN PHẨM TIÊU BIỂU</span>
              </div>

              <h2 className="bridge-headline">
                Bắt đầu từ một use case cụ thể:
                <br />
                Order Automation
              </h2>

              <p className="bridge-subheadline">
                Ví dụ tiêu biểu và hoàn thiện nhất hiện tại của nexagnet là giải pháp tự động hóa xử lý đơn hàng từ các nhóm Zalo đại lý, CTV và tin nhắn đa kênh.
              </p>

              <div className="bridge-benefits-list">
                <div className="bridge-benefit-item">
                  <div className="benefit-icon-box">⚡</div>
                  <div className="benefit-texts">
                    <h4>Chuẩn hóa đơn hàng chỉ trong vài giây</h4>
                    <p>Đọc hiểu tin nhắn viết tắt, không dấu, trích xuất mã sản phẩm và số lượng ngay khi nhận tin.</p>
                  </div>
                </div>

                <div className="bridge-benefit-item">
                  <div className="benefit-icon-box">🎯</div>
                  <div className="benefit-texts">
                    <h4>Chính xác 100% quy tắc kinh doanh</h4>
                    <p>Rules Engine đối soát chính xác theo bảng giá đối tác, chiết khấu và chính sách thương mại được cấu hình trong DB.</p>
                  </div>
                </div>

                <div className="bridge-benefit-item">
                  <div className="benefit-icon-box">🛡️</div>
                  <div className="benefit-texts">
                    <h4>Kiểm soát an toàn với Human-in-the-loop</h4>
                    <p>Đơn vượt hạn mức an toàn hoặc thiếu thông tin lập tức chuyển giao cho nhân sự duyệt trước khi gửi.</p>
                  </div>
                </div>
              </div>

              <div className="bridge-action-wrap">
                <Link href="/products/order-automation" className="btn-primary bridge-cta-btn">
                  <span>Khám phá chi tiết Order Automation</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Right: Simulated Preview Mockup */}
            <div className="bridge-preview-col">
              <div className="bridge-mockup-frame">
                <div className="mockup-header-bar">
                  <span className="m-dot red" />
                  <span className="m-dot yellow" />
                  <span className="m-dot green" />
                  <span className="m-title">Order Automation Flow (Ví dụ minh họa B2B)</span>
                </div>

                <div className="mockup-body">
                  <div className="mockup-stage-row">
                    <div className="stage-tag input-tag">ĐẦU VÀO</div>
                    <div className="stage-bubble">
                      “Gửi về TN cho c 15 cái Felix, cước báo sau nhé”
                    </div>
                  </div>

                  <div className="mockup-arrow">↓ Trích xuất có ràng buộc</div>

                  <div className="mockup-stage-row">
                    <div className="stage-tag rules-tag">ĐỐI SOÁT</div>
                    <div className="stage-box-content">
                      <div className="s-line">✓ Khớp SKU: FLX-01 (15 cái)</div>
                      <div className="s-line">✓ Biểu giá ĐL C1: 1.150.000đ/cái</div>
                      <div className="s-line">✓ Chính sách công nợ: Hợp lệ</div>
                    </div>
                  </div>

                  <div className="mockup-arrow">↓ Phân luồng tất định</div>

                  <div className="mockup-stage-row">
                    <div className="stage-tag action-tag">KẾT QUẢ</div>
                    <div className="stage-box-result">
                      Soạn đơn 17.250.000đ · Gửi xác nhận nhóm Zalo · Chuyển hàng việc Sales
                    </div>
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
