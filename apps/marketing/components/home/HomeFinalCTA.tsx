'use client';

import { useState } from 'react';

export function HomeFinalCTA() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    company: '',
    department: 'sales',
    note: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return;
    setSubmitted(true);
  };

  return (
    <section className="home-final-cta-section" id="demo" aria-label="Đăng ký trao đổi và trải nghiệm">
      <div className="container">
        <div className="final-cta-box">
          <div className="final-cta-grid">
            {/* Left Column: Narrative */}
            <div className="cta-narrative-col">
              <div className="cta-eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                <span className="mono-label">BẮT ĐẦU TỪ MỘT BÀI TOÁN THỰC TẾ</span>
              </div>

              <h2 className="cta-headline">
                Quy trình nào đang làm doanh nghiệp của bạn chậm lại?
              </h2>

              <p className="cta-subheadline">
                Hãy bắt đầu từ một vấn đề thực tế trong bán hàng, chăm sóc khách hàng hoặc vận hành nội bộ. Nexagnet có thể được triển khai theo từng bước thay vì thay đổi toàn bộ hệ thống cùng lúc.
              </p>

              <div className="cta-trust-points">
                <div className="trust-item">
                  <span className="check-glyph" aria-hidden="true">✓</span>
                  <span>Tư vấn trực tiếp theo quy trình thực tế của doanh nghiệp</span>
                </div>
                <div className="trust-item">
                  <span className="check-glyph" aria-hidden="true">✓</span>
                  <span>Định nghĩa chốt chặn kiểm soát và quy tắc tất định trước khi chạy</span>
                </div>
                <div className="trust-item">
                  <span className="check-glyph" aria-hidden="true">✓</span>
                  <span>Tuân thủ Luật Bảo vệ Dữ liệu Cá nhân 91/2025/QH15 &amp; NĐ 356/2025</span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Demo Form */}
            <div className="cta-form-col">
              <div className="form-card-inner">
                {submitted ? (
                  <div className="form-success-state">
                    <div className="success-icon-box">✓</div>
                    <h3 className="success-title">Yêu cầu đã được ghi nhận!</h3>
                    <p className="success-desc">
                      Cảm ơn anh/chị <strong>{formData.name}</strong>. Đội ngũ chuyên gia vận hành của Nexagnet sẽ liên hệ trong vòng 2 giờ làm việc để trao đổi về quy trình của <strong>{formData.company || 'doanh nghiệp'}</strong>.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setSubmitted(false);
                        setFormData({ name: '', phone: '', company: '', department: 'sales', note: '' });
                      }}
                    >
                      Gửi yêu cầu khác
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="demo-lead-form">
                    <h3 className="form-title">Trao đổi với Nexagnet</h3>
                    <p className="form-subtitle">Điền thông tin để được tư vấn luồng quy trình phù hợp:</p>

                    <div className="form-group">
                      <label htmlFor="lead-name" className="form-label">Họ và tên *</label>
                      <input
                        id="lead-name"
                        type="text"
                        required
                        className="form-input"
                        placeholder="Nguyễn Văn A"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label htmlFor="lead-phone" className="form-label">Số điện thoại / Zalo *</label>
                        <input
                          id="lead-phone"
                          type="tel"
                          required
                          className="form-input"
                          placeholder="0912 345 678"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="lead-company" className="form-label">Tên doanh nghiệp</label>
                        <input
                          id="lead-company"
                          type="text"
                          className="form-input"
                          placeholder="Công ty CP ABC"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="lead-dept" className="form-label">Phòng ban quan tâm đầu tiên</label>
                      <select
                        id="lead-dept"
                        className="form-select"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      >
                        <option value="executive">Ban Giám đốc (Toàn cảnh vận hành)</option>
                        <option value="sales">Phòng Bán hàng (Báo giá &amp; Đơn hàng)</option>
                        <option value="cs">Chăm sóc Khách hàng (Đa kênh 24/7)</option>
                        <option value="operations">Phòng Vận hành (Kho vận &amp; Luân chuyển)</option>
                        <option value="finance">Tài chính - Kế toán (Đối soát &amp; Thu thập)</option>
                        <option value="hr">Nhân sự &amp; Nội bộ (Quy chế &amp; Đề xuất)</option>
                        <option value="other">Toàn bộ doanh nghiệp</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="lead-note" className="form-label">Điểm nghẽn quy trình cần giải quyết (Tùy chọn)</label>
                      <textarea
                        id="lead-note"
                        rows={2}
                        className="form-textarea"
                        placeholder="VD: Nhiều nhóm chat dồn đơn cao điểm, nhân viên gõ tay nhầm mã..."
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                      />
                    </div>

                    <button type="submit" className="btn-primary form-submit-btn">
                      <span>Đăng ký trao đổi giải pháp 1-1</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    <p className="form-privacy-note">
                      <span className="privacy-lock">🔒</span>
                      <span>Thông tin của bạn được bảo mật tuyệt đối và chỉ dùng để liên hệ tư vấn giải pháp.</span>
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
