'use client';

import Link from 'next/link';

export function HomeProductsSection() {
  return (
    <section className="home-products-section" aria-label="Sản phẩm tiêu biểu">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>SẢN PHẨM TIÊU BIỂU</span>
          </div>

          <h2 className="section-headline">
            Tự động hóa Xử lý Đơn hàng B2B
            <br />
            (Order Automation)
          </h2>

          <p className="section-subheadline">
            Sản phẩm cốt lõi của nexagnet giúp doanh nghiệp tự động bóc tách tin nhắn đặt hàng qua Zalo và đa kênh, đối soát biểu giá theo cấp đại lý, kiểm tra hạn mức công nợ và phát tin xác nhận an toàn.
          </p>
        </div>

        <div className="flagship-spotlight-card">
          <div className="spotlight-grid">
            <div className="spotlight-left">
              <div className="spotlight-badge-row">
                <span className="spotlight-badge">MODULE TIÊU BIỂU · ĐANG VẬN HÀNH THỰC TẾ</span>
              </div>

              <h3 className="spotlight-title">
                Biến tin nhắn gõ vội trên Zalo thành đơn hàng chuẩn xác.
              </h3>

              <p className="spotlight-desc">
                Không bắt buộc đại lý phải học cú pháp mới. AI của nexagnet tự động đọc hiểu từ viết tắt, tiếng Việt không dấu và ánh xạ chính xác vào danh mục mã SKU của doanh nghiệp.
              </p>

              <div className="spotlight-checklist">
                <div className="spotlight-check-item">
                  <span className="s-check">✓</span>
                  <span>Đọc hiểu ngôn ngữ tự nhiên, viết tắt, không dấu (Closed Dictionary)</span>
                </div>
                <div className="spotlight-check-item">
                  <span className="s-check">✓</span>
                  <span>Rules Engine tính giá, chiết khấu và thuế VAT tất định 100%</span>
                </div>
                <div className="spotlight-check-item">
                  <span className="s-check">✓</span>
                  <span>Tự động phát tin xác nhận vào nhóm trao đổi trong hạn mức</span>
                </div>
                <div className="spotlight-check-item">
                  <span className="s-check">✓</span>
                  <span>Đơn lớn hoặc ngoại lệ lập tức chuyển Sales phê duyệt trước khi gửi</span>
                </div>
              </div>

              <div className="spotlight-actions">
                <Link href="/products/order-automation" className="btn-primary">
                  <span>Tìm hiểu chi tiết Order Automation</span>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>

            <div className="spotlight-right">
              <div className="spotlight-preview-frame">
                <div className="sp-chrome">
                  <span className="sp-dot" />
                  <span className="sp-title">Order Automation Flow</span>
                </div>
                <div className="sp-body">
                  <div className="sp-step-box">
                    <span className="sp-label">ĐẦU VÀO TIN NHẮN (Zalo / Chat)</span>
                    <p className="sp-msg">“Cho anh 20 Felix, giao về chi nhánh Hải Phòng”</p>
                  </div>
                  <div className="sp-arrow">↓</div>
                  <div className="sp-step-box active">
                    <span className="sp-label">TRÍCH XUẤT &amp; ĐỐI SOÁT TẤT ĐỊNH</span>
                    <p className="sp-data">Mã SKU: FLX-01 · SL: 20 · Đơn giá: 1.150.000đ · Tổng: 23.000.000đ</p>
                  </div>
                  <div className="sp-arrow">↓</div>
                  <div className="sp-step-box success">
                    <span className="sp-label">KẾT QUẢ THỰC THI</span>
                    <p className="sp-res">✓ Tự động gửi xác nhận nhóm Zalo · Ghi Hàng việc Sales</p>
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
