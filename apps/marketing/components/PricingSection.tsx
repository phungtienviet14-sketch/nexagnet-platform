'use client';

import Link from 'next/link';

interface PricingTier {
  id: string;
  name: string;
  badge?: string;
  isPopular?: boolean;
  price: string;
  period: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
}

const TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Khởi Nghiệp (Starter)',
    price: '990.000',
    period: 'đ / tháng',
    description: 'Phù hợp cho phòng khám, shop bán lẻ hoặc môi giới cá nhân cần tự động hóa tư vấn và thu lead cơ bản.',
    features: [
      '1 Kênh kết nối (Website Widget hoặc Fanpage)',
      'Tối đa 1.500 hội thoại thông minh / tháng',
      'Đồng bộ kho tri thức từ PDF / Docs (tối đa 20 tài liệu)',
      'Thu thập SĐT & thông tin khách về Google Sheets',
      'Báo cáo thống kê hiệu suất cơ bản',
    ],
    ctaLabel: 'Dùng thử 14 ngày',
    ctaHref: '#demo',
  },
  {
    id: 'pro',
    name: 'Chuyên Nghiệp (Pro)',
    badge: 'ĐƯỢC CHỌN NHIỀU NHẤT',
    isPopular: true,
    price: '2.490.000',
    period: 'đ / tháng',
    description: 'Dành cho sàn BĐS, chuỗi Spa, thẩm mỹ viện và doanh nghiệp phân phối cần đa kênh và đối soát quy tắc.',
    features: [
      '3 Kênh kết nối (Website + Fanpage + Zalo OA / Cá nhân)',
      'Tối đa 6.000 hội thoại thông minh / tháng',
      'Rules Engine tất định (Kiểm tra giá, khuyến mãi, tồn kho)',
      'Cổng kiểm duyệt nhân sự Human-in-the-loop',
      'Tự động đồng bộ CRM / Quản lý đơn hàng',
      'Hỗ trợ kỹ thuật 24/7 và đào tạo nhân sự',
    ],
    ctaLabel: 'Bắt đầu ngay',
    ctaHref: '#demo',
  },
  {
    id: 'enterprise',
    name: 'Doanh Nghiệp (Enterprise)',
    badge: 'MAY ĐO RIÊNG',
    price: 'Liên hệ',
    period: 'tư vấn theo quy mô',
    description: 'Dành cho nhà sản xuất, tổng kho phân phối lớn với hàng trăm nhóm Zalo và tích hợp sâu ERP nội bộ.',
    features: [
      'Không giới hạn số lượng kênh & nhóm Zalo kết nối',
      'Không giới hạn số lượng hội thoại và quy mô dữ liệu',
      'Tích hợp 2 chiều ERP: KiotViet, SAP, Bravo, Base, MISA',
      'Phát tin chiến dịch pacing chống khóa kênh Zalo',
      'Tùy chọn triển khai Private Cloud / On-Premise bảo mật',
      'Cam kết SLA 99.9% & Quản lý tài khoản riêng biệt',
    ],
    ctaLabel: 'Yêu cầu tư vấn Enterprise',
    ctaHref: '#demo',
  },
];

export function PricingSection() {
  return (
    <section className="pricing-section" id="pricing" aria-label="Bảng giá giải pháp">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>BẢNG GIÁ LINH HOẠT</span>
          </div>

          <h2 className="section-headline">
            Chi phí minh bạch,
            <br />
            tối ưu theo từng giai đoạn tăng trưởng.
          </h2>

          <p className="section-subheadline">
            Bắt đầu từ gói cơ bản để tối ưu chuyển đổi, hoặc nâng cấp lên gói chuyên sâu khi doanh nghiệp mở rộng quy mô.
          </p>
        </div>

        <div className="pricing-cards-grid">
          {TIERS.map((tier) => (
            <div key={tier.id} className={`pricing-card ${tier.isPopular ? 'popular-card' : ''}`}>
              {tier.badge && <div className="tier-popular-badge">{tier.badge}</div>}

              <h3 className="tier-name">{tier.name}</h3>
              <p className="tier-desc">{tier.description}</p>

              <div className="tier-price-box">
                <span className="price-val">{tier.price}</span>
                <span className="price-period">{tier.period}</span>
              </div>

              <div className="tier-features-list">
                <div className="feat-title">QUYỀN LỢI BAO GỒM:</div>
                {tier.features.map((feat, idx) => (
                  <div key={idx} className="feat-line">
                    <span className="check-bullet">✓</span>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <div className="tier-cta-box">
                <Link
                  href={tier.ctaHref}
                  className={`btn-tier-cta ${tier.isPopular ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <span>{tier.ctaLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
