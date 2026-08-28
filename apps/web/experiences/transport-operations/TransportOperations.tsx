'use client';

import { useBranding } from '../../lib/branding';

/**
 * Be mat VAN HANH VAN TAI — `GD-23`.
 *
 * VO TOI THIEU, CO CHU Y. Man hinh van hanh that (bang dieu khien, danh sach/chi tiet chuyen, so
 * quy, doi soat) thuoc T7; T2 la moc CODE-ONLY cho tang mien. Cai buoc file nay phai ton tai ngay
 * bay gio la mot rang buoc KIEU, khong phai mot yeu cau san pham: `EXPERIENCE_REGISTRY` khai
 * `satisfies Record<ExperienceId, ExperienceDefinition>`, nen mot experience id khong co component
 * se lam `tsc` cua `apps/web` do.
 *
 * Dung mot vo that thay vi noi long rang buoc kia thanh `Partial<...>`: rang buoc do la thu bao
 * dam mot khach khong bao gio boot ra mot trang trong. Ha no xuong de tien cho mot mien chua co UI
 * la doi mot bat bien cua nen tang lay mot tien nghi tam thoi.
 */
export function TransportOperations() {
  const branding = useBranding();

  return (
    <main className="knowledge-workspace" data-experience="transport-operations">
      <header className="knowledge-workspace__header">
        <span className="knowledge-workspace__monogram" aria-hidden="true">
          {branding.monogram}
        </span>
        <div>
          <p className="knowledge-workspace__eyebrow">{branding.shortName}</p>
          <h1>Vận hành vận tải</h1>
          <p>
            Đội xe, lái xe, khách hàng, đối tác và chuyến hàng đã chạy ở tầng dữ liệu. Màn hình vận
            hành đầy đủ được dựng ở mốc giao diện; hiện tại nghiệp vụ truy cập qua API
            <code> /transport/*</code>.
          </p>
        </div>
      </header>
      <nav aria-label="Điều hướng vận hành vận tải">
        <a className="knowledge-workspace__link" href="/settings">
          Mở quản trị hệ thống →
        </a>
      </nav>
    </main>
  );
}
