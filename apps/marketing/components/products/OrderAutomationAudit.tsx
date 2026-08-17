'use client';

export function OrderAutomationAudit() {
  return (
    <section className="order-audit-section" id="audit" aria-label="Kiểm soát và quản trị vận hành">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>QUẢN TRỊ & KIỂM TOÁN VẬN HÀNH</span>
          </div>

          <h2 className="section-headline">
            Minh bạch từng thao tác.
            <br />
            Không một hành động nào nằm ngoài tầm kiểm soát.
          </h2>

          <p className="section-subheadline">
            Mọi bước xử lý từ tiếp nhận tin nhắn, trích xuất dữ liệu, kiểm tra quy tắc đến gửi phản hồi đều được hiển thị trực quan trên giao diện điều hành của Sales và cấp quản lý.
          </p>
        </div>

        <div className="audit-showcase-grid">
          {/* Left: Operational Features */}
          <div className="audit-features-col">
            <div className="audit-feature-box">
              <div className="af-icon">📋</div>
              <div className="af-content">
                <h4>Hàng việc nhân sự bám theo tin nhắn</h4>
                <p>Mỗi đơn hàng ngoại lệ hoặc cần duyệt xuất hiện kèm toàn bộ ngữ cảnh tin nhắn gốc và giải pháp gợi ý từ hệ thống.</p>
              </div>
            </div>

            <div className="audit-feature-box">
              <div className="af-icon">🔍</div>
              <div className="af-content">
                <h4>Lưu vết kiểm toán chi tiết (Audit Trail)</h4>
                <p>Tra cứu lại chính xác tại sao đơn hàng được duyệt tự động, áp dụng bảng giá nào và ai là người chịu trách nhiệm.</p>
              </div>
            </div>

            <div className="audit-feature-box">
              <div className="af-icon">🎛️</div>
              <div className="af-content">
                <h4>Cập nhật nguồn sự thật linh hoạt</h4>
                <p>Giao diện quản trị cho phép Sales và Quản lý tự cập nhật bảng giá mới, thêm đại lý hoặc đổi map nhóm Zalo tức thì.</p>
              </div>
            </div>
          </div>

          {/* Right: Simulated Dashboard Mockup */}
          <div className="audit-mockup-col">
            <div className="audit-console-frame">
              <div className="console-chrome">
                <div className="console-title">Trung tâm điều hành Order Automation</div>
                <div className="console-status">Hệ thống đang hoạt động · PERSISTENCE: ON</div>
              </div>

              <div className="console-body">
                <div className="console-row header-row">
                  <span>THỜI GIAN</span>
                  <span>ĐẠI LÝ / KÊNH</span>
                  <span>SKU &amp; SL</span>
                  <span>QUY TẮC</span>
                  <span>TRẠNG THÁI</span>
                </div>

                <div className="console-row">
                  <span className="c-time">10:42:15</span>
                  <span className="c-agent">Meta Thái Nguyên (Zalo)</span>
                  <span className="c-sku">15 x FLX-01</span>
                  <span className="c-rules valid">✓ Đạt 4/4 quy tắc</span>
                  <span className="c-status auto">Tự động gửi</span>
                </div>

                <div className="console-row">
                  <span className="c-time">10:45:02</span>
                  <span className="c-agent">NPP Đông Bắc (Zalo)</span>
                  <span className="c-sku">60 x FLX-01</span>
                  <span className="c-rules warn">! Vượt ngưỡng (&gt;50)</span>
                  <span className="c-status review">Chờ Sales duyệt</span>
                </div>

                <div className="console-row">
                  <span className="c-time">10:48:30</span>
                  <span className="c-agent">Điện máy Hải Phòng (Zalo)</span>
                  <span className="c-sku">8 x LUK-16</span>
                  <span className="c-rules valid">✓ Đạt 4/4 quy tắc</span>
                  <span className="c-status auto">Tự động gửi</span>
                </div>
              </div>

              <div className="console-footer-bar">
                <span>Ngưỡng tự động hóa hiện tại: ≤ 50 sản phẩm</span>
                <span className="footer-switch">Kill-Switch: SẴN SÀNG</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
