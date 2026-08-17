import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export default function NotFound() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main className="container" style={{ padding: '120px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            404 · KHÔNG TÌM THẤY TRANG
          </span>
          <h1 style={{ fontSize: '32px', fontWeight: 750, color: 'var(--text-primary)', margin: '16px 0' }}>
            Trang bạn tìm kiếm không tồn tại
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '32px' }}>
            Nội dung có thể đã được cập nhật hoặc chuyển sang cấu trúc phòng ban mới của nexagnet.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link href="/" className="btn-primary">
              <span>Về Trang chủ</span>
            </Link>
            <Link href="/departments" className="btn-secondary">
              <span>Khám phá Phòng ban</span>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
