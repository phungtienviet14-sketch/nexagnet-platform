'use client';

import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer-root" role="contentinfo">
      <div className="container">
        <div className="footer-grid">
          {/* Cột Thương hiệu */}
          <div className="footer-brand-col">
            <Link href="/" className="footer-brand-link" aria-label="Trang chủ nexagnet">
              <span className="brand-motif" aria-hidden="true">
                <span className="brand-dot" />
              </span>
              <span className="brand-wordmark">nexagnet</span>
            </Link>
            <p className="footer-tagline">
              Nền tảng AI cho Doanh nghiệp. Giúp doanh nghiệp ứng dụng AI vào bán hàng, chăm sóc khách hàng và vận hành nội bộ theo từng module có kiểm soát.
            </p>
            <div className="footer-trust-badge">
              <span className="trust-dot" />
              <span>Bảo vệ dữ liệu theo Luật 91/2025/QH15 &amp; NĐ 356/2025</span>
            </div>
          </div>

          {/* Cột Sản phẩm & Giải pháp */}
          <div className="footer-links-col">
            <div className="footer-col-title">SẢN PHẨM &amp; GIẢI PHÁP</div>
            <ul className="footer-links-list">
              <li>
                <Link href="/products/order-automation" className="footer-link highlight">
                  ★ Xử lý Đơn hàng (Order Automation)
                </Link>
              </li>

              <li>
                <Link href="/solutions/sales" className="footer-link">
                  Giải pháp Bán hàng
                </Link>
              </li>
              <li>
                <Link href="/solutions/customer-service" className="footer-link">
                  Giải pháp Chăm sóc Khách hàng
                </Link>
              </li>
              <li>
                <Link href="/solutions/operations" className="footer-link">
                  Giải pháp Vận hành
                </Link>
              </li>
              <li>
                <Link href="/solutions/internal-knowledge" className="footer-link">
                  Tri thức Doanh nghiệp
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
                  Bán lẻ &amp; Phân phối
                </Link>
              </li>
              <li>
                <Link href="/industries/spa-beauty" className="footer-link">
                  Spa &amp; Thẩm mỹ
                </Link>
              </li>
              <li>
                <Link href="/industries/real-estate" className="footer-link">
                  Bất động sản
                </Link>
              </li>
              <li>
                <Link href="/industries/education" className="footer-link">
                  Giáo dục &amp; Đào tạo
                </Link>
              </li>
              <li>
                <Link href="/platform" className="footer-link">
                  Tổng quan Nền tảng
                </Link>
              </li>
              <li>
                <Link href="/platform/control" className="footer-link">
                  Kiểm soát &amp; Quản trị
                </Link>
              </li>
            </ul>
          </div>

          {/* Cột Tài nguyên & Liên hệ */}
          <div className="footer-links-col">
            <div className="footer-col-title">TÀI NGUYÊN &amp; LIÊN HỆ</div>
            <ul className="footer-links-list">
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
                <span className="footer-link-text">Hỗ trợ kỹ thuật:</span>
                <a href="mailto:support@nexagnet247.com" className="footer-link">
                  support@nexagnet247.com
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
            © {currentYear} nexagnet (nexagnet247.com). Nền tảng AI cho Doanh nghiệp.
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
