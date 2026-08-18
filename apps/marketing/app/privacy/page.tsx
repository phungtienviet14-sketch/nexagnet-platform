import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroLocationBadge } from '@/components/shared/HeroLocationBadge';

export const metadata: Metadata = {
  title: 'Chính sách Quyền riêng tư — nexagnet',
  description:
    'Chính sách quyền riêng tư và bảo vệ dữ liệu của nexagnet. Minh bạch về mục đích thu thập và bảo vệ thông tin doanh nghiệp.',
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <div className="privacy-page-root">
      <header className="privacy-header" role="banner">
        <div className="container">
          <div className="privacy-nav-inner">
            <Link href="/" className="brand-link" aria-label="Trang chủ nexagnet">
              <span className="brand-motif" aria-hidden="true">
                <span className="brand-dot" />
              </span>
              <span className="brand-wordmark">nexagnet</span>
            </Link>
            <Link href="/" className="btn-secondary privacy-back-btn">
              ← Quay lại trang chủ
            </Link>
          </div>
        </div>
      </header>

      <main className="privacy-main" role="main">
        <div className="container privacy-container">
          <div className="privacy-content-card">
            <div className="mb-6">
              <HeroLocationBadge
                family="legal"
                categoryLabel="PHÁP LÝ & BẢO MẬT"
                currentPage="Chính sách Quyền riêng tư"
                badge="LUẬT 91/2025/QH15"
              />
            </div>
            <h1 className="privacy-title">Bảo vệ Dữ liệu &amp; Quyền riêng tư</h1>
            <p className="privacy-updated">Cập nhật lần cuối: Tháng 8, 2026 · Tuân thủ Luật 91/2025/QH15 &amp; NĐ 356/2025</p>

            <section className="privacy-section">
              <h2>1. Giới thiệu & Cam kết cốt lõi</h2>
              <p>
                Tại <strong>nexagnet</strong> (vận hành tại tên miền <code>nexagnet247.com</code>), chúng tôi cam kết tôn trọng và bảo vệ quyền riêng tư của mọi cá nhân và doanh nghiệp khi truy cập website hoặc gửi yêu cầu tư vấn giải pháp.
              </p>
              <p>
                Kiến trúc của nexagnet được xây dựng trên nguyên tắc cách ly dữ liệu, bảo mật nhiều lớp và phân quyền truy cập nghiêm ngặt. Chúng tôi không bao giờ chia sẻ, trao đổi hoặc bán thông tin của bạn cho bất kỳ bên thứ ba nào vì mục đích thương mại.
              </p>
            </section>

            <section className="privacy-section">
              <h2>2. Dữ liệu chúng tôi thu thập</h2>
              <p>
                Khi bạn điền biểu mẫu <em>Đăng ký tư vấn & Nhận Demo</em> trên website, chúng tôi chỉ thu thập các thông tin cần thiết tối thiểu cho việc liên hệ nghiệp vụ, bao gồm:
              </p>
              <ul>
                <li><strong>Họ và tên:</strong> Để thuận tiện xưng hô trong trao đổi công việc.</li>
                <li><strong>Số điện thoại / Zalo:</strong> Để chuyên viên giải pháp liên hệ tư vấn trực tiếp và gửi lịch hẹn demo.</li>
                <li><strong>Email công việc:</strong> Để gửi tài liệu giải pháp, báo giá hoặc thông tin kỹ thuật liên quan.</li>
                <li><strong>Tên doanh nghiệp:</strong> Để tìm hiểu bối cảnh ngành nghề và chuẩn bị kịch bản demo phù hợp.</li>
                <li><strong>Quy trình vận hành quan tâm:</strong> Để phân bổ chuyên gia đúng chuyên môn nghiệp vụ.</li>
                <li><strong>Ghi chú bổ sung (nếu có):</strong> Nhu cầu hoặc câu hỏi đặc thù mà bạn chủ động cung cấp.</li>
              </ul>
            </section>

            <section className="privacy-section">
              <h2>3. Mục đích sử dụng thông tin</h2>
              <p>Toàn bộ thông tin được cung cấp chỉ được sử dụng cho các mục đích chính đáng sau:</p>
              <ul>
                <li>Liên hệ phản hồi và giải đáp các thắc mắc về giải pháp nexagnet.</li>
                <li>Sắp xếp và tiến hành buổi trao đổi tư vấn, khảo sát quy trình và demo giải pháp 1-1.</li>
                <li>Cung cấp tài liệu kỹ thuật, đề xuất kiến trúc hoặc báo giá theo yêu cầu cụ thể của doanh nghiệp bạn.</li>
              </ul>
              <p>
                Dữ liệu của bạn <strong>tuyệt đối không được sử dụng</strong> để huấn luyện các mô hình AI công cộng hoặc gửi các nội dung quảng cáo rác không liên quan.
              </p>
            </section>

            <section className="privacy-section">
              <h2>4. Lưu trữ & Bảo vệ dữ liệu</h2>
              <p>
                Dữ liệu đăng ký được lưu trữ trên hạ tầng máy chủ bảo mật với các biện pháp kiểm soát truy cập phân quyền. Chỉ các nhân sự được ủy quyền phụ trách tư vấn khách hàng mới có quyền tiếp cận các thông tin này để thực hiện nhiệm vụ.
              </p>
            </section>

            <section className="privacy-section">
              <h2>5. Quyền của bạn đối với dữ liệu cá nhân</h2>
              <p>Bạn luôn có toàn quyền kiểm soát đối với thông tin đã cung cấp cho chúng tôi, bao gồm:</p>
              <ul>
                <li>Yêu cầu kiểm tra, tra cứu thông tin liên hệ đang được lưu trữ.</li>
                <li>Yêu cầu hiệu chỉnh, cập nhật thông tin nếu có thay đổi.</li>
                <li>Yêu cầu xóa bỏ hoàn toàn dữ liệu liên hệ khỏi hệ thống bất kỳ lúc nào.</li>
              </ul>
            </section>

            <section className="privacy-section">
              <h2>6. Đầu mối liên hệ</h2>
              <p>
                Mọi yêu cầu liên quan đến quyền riêng tư, chỉnh sửa hoặc xóa thông tin liên hệ, xin vui lòng gửi email về địa chỉ tiếp nhận chính thức:
              </p>
              <p className="privacy-contact-box">
                <strong>Bộ phận Quản trị Quyền riêng tư & Dữ liệu nexagnet</strong>
                <br />
                Email: <code>contact@nexagnet247.com</code>
              </p>
            </section>
          </div>
        </div>
      </main>

      <footer className="privacy-footer" role="contentinfo">
        <div className="container">
          <div className="privacy-footer-inner">
            <span>© {new Date().getFullYear()} nexagnet platform (nexagnet247.com). Tất cả quyền được bảo lưu.</span>
            <Link href="/" className="footer-link">Trang chủ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
