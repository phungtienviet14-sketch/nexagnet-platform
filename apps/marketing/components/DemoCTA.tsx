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

export function DemoCTA() {
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

    // Client-side quick checks
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
    <section className="demo-section" id="demo" aria-label="Đăng ký Demo và Tư vấn Giải pháp">
      <div className="container">
        <div className="demo-card-wrapper">
          <div className="demo-grid">
            {/* Left: Value Proposition */}
            <div className="demo-info-col">
              <div className="demo-eyebrow">
                <span className="demo-eyebrow-dot" aria-hidden="true" />
                <span>BẮT ĐẦU VỚI NEXAGNET</span>
              </div>

              <h2 className="demo-headline">
                Sẵn sàng nâng cấp
                <br />
                vận hành doanh nghiệp?
              </h2>

              <p className="demo-subheadline">
                Đăng ký buổi tư vấn trực tiếp 1-1. Đội ngũ chuyên gia nexagnet sẽ khảo sát quy trình thực tế và xây dựng giải pháp thử nghiệm trên chính nghiệp vụ của doanh nghiệp bạn.
              </p>

              <div className="demo-benefits-list">
                <div className="demo-benefit-item">
                  <div className="benefit-icon" aria-hidden="true">✓</div>
                  <div className="benefit-text">
                    <strong>Khảo sát quy trình:</strong> Phân tích luồng tin nhắn và đánh giá tính khả thi cho việc tự động hóa.
                  </div>
                </div>

                <div className="demo-benefit-item">
                  <div className="benefit-icon" aria-hidden="true">✓</div>
                  <div className="benefit-text">
                    <strong>Demo trên dữ liệu mẫu:</strong> Trực tiếp trải nghiệm AI trích xuất tin nhắn và đối soát quy tắc kinh doanh theo kịch bản thật.
                  </div>
                </div>

                <div className="demo-benefit-item">
                  <div className="benefit-icon" aria-hidden="true">✓</div>
                  <div className="benefit-text">
                    <strong>Lộ trình triển khai từng bước:</strong> Khởi đầu từ một quy trình cụ thể và mở rộng khi doanh nghiệp sẵn sàng.
                  </div>
                </div>
              </div>

              <div className="demo-trust-badge">
                <span className="trust-shield" aria-hidden="true">🛡</span>
                <span>Bảo vệ dữ liệu nhiều lớp · Đội ngũ nexagnet sẽ liên hệ trao đổi nhu cầu và sắp xếp demo</span>
              </div>
            </div>

            {/* Right: Registration Form */}
            <div className="demo-form-col">
              {isSubmitted ? (
                <div className="form-success-card" role="alert" aria-live="polite">
                  <div className="success-icon-wrap" aria-hidden="true">✓</div>
                  <h3 className="success-title">Yêu cầu đã được tiếp nhận thành công!</h3>
                  <p className="success-desc">
                    Cảm ơn bạn đã quan tâm đến nexagnet. Đội ngũ giải pháp của chúng tôi sẽ liên hệ lại qua Số điện thoại / Zalo để trao đổi nhu cầu cụ thể và gửi lịch hẹn demo.
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
                <form className="demo-form" onSubmit={handleSubmit} noValidate>
                  <h3 className="form-title">Đăng ký tư vấn giải pháp</h3>
                  <p className="form-subtitle">Điền thông tin để nhận lịch demo dành riêng cho doanh nghiệp của bạn.</p>

                  {/* Honeypot field (hidden from real users, filled by spam bots) */}
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
                      Tên công ty / Doanh nghiệp <span className="req">*</span>
                    </label>
                    <input
                      id="company"
                      type="text"
                      required
                      placeholder="Ví dụ: Công ty Cổ phần Gia dụng ABC"
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
                      <option value="orders">Xử lý Đơn hàng Zalo & Đối soát quy tắc (Orders)</option>
                      <option value="knowledge">Tra cứu Tri thức & CSKH nội bộ (Knowledge)</option>
                      <option value="campaigns">Phát tin Chiến dịch Đại lý hàng loạt (Campaigns)</option>
                      <option value="custom">Quy trình vận hành đặc thù khác</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary form-submit-btn"
                    disabled={isSubmitting}
                  >
                    <span>{isSubmitting ? 'Đang gửi thông tin...' : 'Đăng ký Tư vấn & Nhận Demo'}</span>
                    {!isSubmitting && (
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
                    )}
                  </button>

                  <p className="form-privacy-note">
                    Bằng việc gửi thông tin, bạn đồng ý để nexagnet liên hệ tư vấn giải pháp. Dữ liệu của bạn được quản lý và bảo vệ theo{' '}
                    <Link href="/privacy" className="privacy-inline-link">
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
