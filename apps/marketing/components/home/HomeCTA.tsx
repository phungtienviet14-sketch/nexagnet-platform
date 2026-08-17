'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  company: string;
  workflow: string;
  note: string;
  website: string; // Honeypot field
}

export function HomeCTA() {
  const [formData, setFormData] = useState<FormState>({
    fullName: '',
    phone: '',
    email: '',
    company: '',
    workflow: 'orders',
    note: '',
    website: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.fullName.trim() || !formData.phone.trim() || !formData.email.trim() || !formData.company.trim()) {
      setErrorMessage('Vui lòng điền đầy đủ các trường bắt buộc (*)');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        setErrorMessage(data.message ?? 'Đã có lỗi xảy ra. Vui lòng kiểm tra lại thông tin hoặc thử lại sau.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitted(true);
      setIsSubmitting(false);
    } catch {
      setErrorMessage('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.');
      setIsSubmitting(false);
    }
  };

  return (
    <section className="home-final-cta-section" id="demo" aria-label="Đăng ký tư vấn giải pháp">
      <div className="container">
        <div className="final-cta-wrapper">
          <div className="final-cta-grid">
            {/* Left: Value Proposition */}
            <div className="final-cta-left">
              <div className="section-eyebrow">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>BẮT ĐẦU VỚI NEXAGNET</span>
              </div>

              <h2 className="final-cta-headline">
                Đưa AI vào vận hành —
                <br />
                theo cách có kiểm soát.
              </h2>

              <p className="final-cta-subheadline">
                Đăng ký buổi trao đổi giải pháp trực tiếp 1-1. Đội ngũ chuyên gia nexagnet sẽ cùng bạn phân tích luồng công việc hiện tại và thiết kế lộ trình tự động hóa phù hợp nhất.
              </p>

              <div className="cta-commitments-list">
                <div className="commitment-item">
                  <span className="c-icon">✓</span>
                  <div>
                    <strong>Khảo sát quy trình:</strong> Đánh giá mức độ khả thi và xác định đúng điểm nghẽn trước khi triển khai.
                  </div>
                </div>

                <div className="commitment-item">
                  <span className="c-icon">✓</span>
                  <div>
                    <strong>Demo trên dữ liệu mẫu:</strong> Trực tiếp trải nghiệm AI trích xuất và Rules Engine đối soát theo kịch bản thật.
                  </div>
                </div>

                <div className="commitment-item">
                  <span className="c-icon">✓</span>
                  <div>
                    <strong>Lộ trình từng bước:</strong> Khởi đầu từ một module cụ thể và mở rộng khi doanh nghiệp đã sẵn sàng.
                  </div>
                </div>
              </div>

              <div className="security-notice-pill">
                <span>🛡️ Bảo vệ dữ liệu theo Luật 91/2025/QH15 &amp; NĐ 356/2025</span>
              </div>
            </div>

            {/* Right: Lead Generation Form */}
            <div className="final-cta-right">
              {isSubmitted ? (
                <div className="form-success-card" role="alert" aria-live="polite">
                  <div className="success-icon-wrap" aria-hidden="true">✓</div>
                  <h3 className="success-title">Yêu cầu đã được tiếp nhận thành công!</h3>
                  <p className="success-desc">
                    Cảm ơn bạn đã quan tâm đến nexagnet. Đội ngũ giải pháp sẽ liên hệ qua Số điện thoại / Zalo để trao đổi nhu cầu và gửi lịch demo trong thời gian sớm nhất.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setIsSubmitted(false);
                      setFormData({
                        fullName: '',
                        phone: '',
                        email: '',
                        company: '',
                        workflow: 'orders',
                        note: '',
                        website: '',
                      });
                    }}
                  >
                    Gửi thêm thông tin
                  </button>
                </div>
              ) : (
                <form className="home-demo-form" onSubmit={handleSubmit} noValidate>
                  <h3 className="form-title">Đăng ký tư vấn &amp; Demo 1-1</h3>
                  <p className="form-subtitle">Điền thông tin để chuyên gia nexagnet liên hệ trao đổi chi tiết.</p>

                  {/* Honeypot field */}
                  <div style={{ display: 'none' }} aria-hidden="true">
                    <label htmlFor="website">Website</label>
                    <input
                      id="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>

                  {errorMessage && (
                    <div className="form-error-alert" role="alert" aria-live="polite">
                      <span className="error-icon" aria-hidden="true">⚠</span>
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="fullName" className="form-label">
                      Họ và tên <span className="req">*</span>
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      required
                      placeholder="Ví dụ: Nguyễn Văn An"
                      className="form-input"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor="phone" className="form-label">
                        Số điện thoại / Zalo <span className="req">*</span>
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        required
                        placeholder="0912 345 678"
                        className="form-input"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="email" className="form-label">
                        Email công việc <span className="req">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        placeholder="an.nguyen@company.vn"
                        className="form-input"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="company" className="form-label">
                      Tên doanh nghiệp / Đơn vị <span className="req">*</span>
                    </label>
                    <input
                      id="company"
                      type="text"
                      required
                      placeholder="Ví dụ: Công ty Cổ phần Phân phối XYZ"
                      className="form-input"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="workflow" className="form-label">
                      Quy trình bạn muốn tự động hóa trước tiên
                    </label>
                    <select
                      id="workflow"
                      className="form-select"
                      value={formData.workflow}
                      onChange={(e) => setFormData({ ...formData, workflow: e.target.value })}
                      disabled={isSubmitting}
                    >
                      <option value="orders">Order Automation — Xử lý đơn hàng Zalo &amp; Đa kênh</option>
                      <option value="knowledge">Knowledge Base — Tra cứu tri thức &amp; CSKH nội bộ</option>
                      <option value="campaigns">Campaigns — Phát tin chiến dịch đại lý định kỳ</option>
                      <option value="custom">Quy trình vận hành đặc thù khác</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary form-submit-btn"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span>Đang gửi thông tin...</span>
                    ) : (
                      <>
                        <span>Đăng ký Tư vấn &amp; Nhận Demo</span>
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
                      </>
                    )}
                  </button>

                  <p className="form-legal-note">
                    Bằng việc gửi thông tin, bạn đồng ý để nexagnet liên hệ tư vấn giải pháp. Dữ liệu của bạn được bảo mật theo{' '}
                    <Link href="/privacy" className="legal-link">
                      Chính sách quyền riêng tư
                    </Link>.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
