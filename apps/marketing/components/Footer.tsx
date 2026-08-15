import Link from 'next/link';

export function Footer() {
  return (
    <footer className="footer-root" role="contentinfo">
      <div className="container">
        <div className="footer-main-grid">
          {/* Brand Info Column */}
          <div className="footer-brand-col">
            <Link href="/" className="brand-link" aria-label="Trang chủ nexagnet">
              <span className="brand-motif" aria-hidden="true">
                <span className="brand-dot" />
              </span>
              <span className="brand-wordmark">nexagnet</span>
            </Link>

            <p className="footer-brand-desc">
              Nền tảng AI Agent theo module cho doanh nghiệp. Tự động hóa từng quy trình vận hành từ hội thoại đa kênh mà vẫn duy trì quy tắc kinh doanh và quyền kiểm soát tối cao của con người.
            </p>

            <div className="footer-philosophy-pill">
              <span>AI thấu hiểu → Quy tắc quyết định → Con người kiểm soát</span>
            </div>
          </div>

          {/* Links Column 1: Nền tảng */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Nền tảng</h4>
            <ul className="footer-list">
              <li><a href="#platform">Kiến trúc 3 Lớp</a></li>
              <li><a href="#platform">Rules Engine Tất định</a></li>
              <li><a href="#platform">Cổng Kiểm duyệt Nhân sự</a></li>
              <li><a href="#security">Bảo mật & Quản trị</a></li>
              <li><a href="#demo">Yêu cầu Demo</a></li>
            </ul>
          </div>

          {/* Links Column 2: Phân hệ Vận hành */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Phân hệ Vận hành</h4>
            <ul className="footer-list">
              <li><a href="#modules">Xử lý Đơn hàng (Orders)</a></li>
              <li><a href="#modules">Tri thức & CSKH (Knowledge)</a></li>
              <li><a href="#modules">Chiến dịch CSKH (Campaigns)</a></li>
              <li><a href="#modules">Quy trình Tùy biến</a></li>
              <li><a href="#demo">Đăng ký Tư vấn Module</a></li>
            </ul>
          </div>

          {/* Links Column 3: Tuân thủ & Tài nguyên */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Chính sách & Pháp lý</h4>
            <ul className="footer-list">
              <li><Link href="/privacy">Chính sách Quyền riêng tư</Link></li>
              <li><Link href="/privacy#principles">Nguyên tắc Bảo vệ Dữ liệu</Link></li>
              <li><Link href="/privacy#storage">Lưu trữ & Kiểm soát Truy cập</Link></li>
              <li><Link href="/privacy#rights">Quyền của Doanh nghiệp</Link></li>
              <li><Link href="/privacy#contact">Đầu mối Liên hệ</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Principles */}
        <div className="footer-bottom-bar">
          <div className="footer-copy">
            © {new Date().getFullYear()} nexagnet platform (nexagnet247.com). Tất cả các quyền được bảo lưu.
          </div>

          <div className="footer-legal-links">
            <span className="legal-item">Bảo mật đa tầng</span>
            <span className="legal-sep" aria-hidden="true">•</span>
            <span className="legal-item">Lõi Quy tắc Tất định</span>
            <span className="legal-sep" aria-hidden="true">•</span>
            <span className="legal-item">Hạ tầng phân lập</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
