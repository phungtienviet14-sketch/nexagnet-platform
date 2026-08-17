'use client';

import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer-root" role="contentinfo">
      <div className="container">
        <div className="footer-grid">
          {/* Cột Thương hiệu & Định vị */}
          <div className="footer-brand-col">
            <Link href="/" className="footer-brand-link" aria-label="Trang chủ nexagnet">
              <span className="brand-motif" aria-hidden="true">
                <span className="brand-dot" />
              </span>
              <span className="brand-wordmark">nexagnet</span>
            </Link>
            <p className="footer-tagline">
              Nền tảng AI cho vận hành và điều hành doanh nghiệp (Enterprise AI Operations Platform). Đưa AI vào các quy trình giữa khách hàng, nhân viên, dữ liệu và hệ thống với sự kiểm soát chặt chẽ.
            </p>
            <div className="footer-trust-badge">
              <span className="trust-dot" />
              <span>Bảo vệ dữ liệu theo Luật 91/2025/QH15 &amp; NĐ 356/2025</span>
            </div>
          </div>

          {/* Cột Phòng ban */}
          <div className="footer-links-col">
            <div className="footer-col-title">PHÒNG BAN (DEPARTMENTS)</div>
            <ul className="footer-links-list">
              <li>
                <Link href="/departments/executive" className="footer-link highlight">
                  ★ Ban Giám đốc (Executive)
                </Link>
              </li>
              <li>
                <Link href="/departments/sales" className="footer-link">
                  Phòng Bán hàng (Sales)
                </Link>
              </li>
              <li>
                <Link href="/departments/marketing" className="footer-link">
                  Phòng Tiếp thị (Marketing)
                </Link>
              </li>
              <li>
                <Link href="/departments/customer-service" className="footer-link">
                  Chăm sóc Khách hàng (CSKH)
                </Link>
              </li>
              <li>
                <Link href="/departments/operations" className="footer-link">
                  Phòng Vận hành (Operations)
                </Link>
              </li>
              <li>
                <Link href="/departments/finance" className="footer-link">
                  Tài chính &amp; Kế toán (Finance)
                </Link>
              </li>
              <li>
                <Link href="/departments/hr" className="footer-link">
                  Nhân sự &amp; Nội bộ (HR)
                </Link>
              </li>
            </ul>
          </div>

          {/* Cột Ngành & Nền tảng */}
          <div className="footer-links-col">
            <div className="footer-col-title">NGÀNH &amp; NỀN TẢNG</div>
            <ul className="footer-links-list">
              <li>
                <Link href="/industries/retail-distribution" className="footer-link">
                  Bán lẻ &amp; Phân phối (B2B)
                </Link>
              </li>
              <li>
                <Link href="/industries/manufacturing" className="footer-link">
                  Sản xuất &amp; Gia công
                </Link>
              </li>
              <li>
                <Link href="/industries/logistics" className="footer-link">
                  Vận tải &amp; Logistics
                </Link>
              </li>
              <li>
                <Link href="/industries/healthcare-clinic" className="footer-link">
                  Y tế &amp; Phòng khám
                </Link>
              </li>
              <li>
                <Link href="/industries/spa-beauty" className="footer-link">
                  Spa &amp; Thẩm mỹ
                </Link>
              </li>
              <li>
                <Link href="/industries/fnb-chains" className="footer-link">
                  Chuỗi Nhà hàng &amp; F&B
                </Link>
              </li>
              <li>
                <Link href="/industries/financial-services" className="footer-link">
                  Tài chính &amp; Bảo hiểm
                </Link>
              </li>
              <li>
                <Link href="/industries/construction-interior" className="footer-link">
                  Xây dựng &amp; Nội thất
                </Link>
              </li>
              <li>
                <Link href="/industries/real-estate" className="footer-link">
                  Bất động sản &amp; Sàn GD
                </Link>
              </li>
              <li>
                <Link href="/industries/professional-services" className="footer-link">
                  Luật &amp; Tư vấn DN
                </Link>
              </li>
              <li>
                <Link href="/platform" className="footer-link highlight">
                  ★ Tổng quan Nền tảng (Platform)
                </Link>
              </li>
            </ul>
          </div>

          {/* Cột Sản phẩm & Tài nguyên */}
          <div className="footer-links-col">
            <div className="footer-col-title">SẢN PHẨM &amp; TÀI NGUYÊN</div>
            <ul className="footer-links-list">
              <li>
                <Link href="/products/order-automation" className="footer-link highlight">
                  Xử lý Đơn hàng (Order Automation)
                </Link>
              </li>
              <li>
                <Link href="/products/knowledge" className="footer-link">
                  Tri thức Doanh nghiệp (Knowledge)
                </Link>
              </li>
              <li>
                <Link href="/products/campaigns" className="footer-link">
                  Điều phối Chiến dịch (Campaigns)
                </Link>
              </li>
              <li>
                <Link href="/resources/faq" className="footer-link">
                  Câu hỏi Thường gặp (FAQ)
                </Link>
              </li>
              <li>
                <Link href="/resources/roadmap" className="footer-link">
                  Lộ trình Phát triển
                </Link>
              </li>
              <li>
                <span className="footer-link-text">Tư vấn giải pháp:</span>
                <a href="mailto:contact@nexagnet247.com" className="footer-link highlight">
                  contact@nexagnet247.com
                </a>
              </li>
              <li>
                <Link href="/privacy" className="footer-link">
                  Chính sách Bảo mật Dữ liệu
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom-bar">
          <div className="footer-copy">
            © {currentYear} nexagnet (nexagnet247.com). Nền tảng AI cho Vận hành và Điều hành Doanh nghiệp.
          </div>
          <div className="footer-legal-links">
            <Link href="/privacy">Chính sách bảo mật</Link>
            <span className="sep">·</span>
            <Link href="/#demo">Điều khoản dịch vụ</Link>
            <span className="sep">·</span>
            <Link href="/sitemap.xml">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
