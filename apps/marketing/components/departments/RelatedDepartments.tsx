'use client';

import Link from 'next/link';
import {
  IconExecutive,
  IconSales,
  IconMarketing,
  IconCSKH,
  IconOperations,
  IconFinance,
  IconHR,
} from '@/components/shared/EnterpriseIcons';

interface DeptItem {
  name: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;
  desc: string;
  href: string;
  badge?: string;
}

interface RelatedDepartmentsProps {
  title?: string;
  subtitle?: string;
  currentDeptSlug?: string;
}

const ALL_DEPARTMENTS: DeptItem[] = [
  {
    name: 'executive',
    label: 'Ban Giám đốc (Executive)',
    Icon: IconExecutive,
    desc: 'Lọc nhiễu vận hành, nhìn toàn cảnh trạng thái công việc và kiểm soát các ngoại lệ cần can thiệp.',
    href: '/departments/executive',
    badge: 'Chủ doanh nghiệp',
  },
  {
    name: 'sales',
    label: 'Phòng Bán hàng (Sales)',
    Icon: IconSales,
    desc: 'Giảm thao tác lặp lại từ tiếp nhận lead, tra cứu bảng giá đại lý đến xử lý yêu cầu đặt hàng.',
    href: '/departments/sales',
  },
  {
    name: 'marketing',
    label: 'Phòng Tiếp thị (Marketing)',
    Icon: IconMarketing,
    desc: 'Biến dữ liệu tương tác và phản hồi khách hàng thành workflow phân loại và nuôi dưỡng lead.',
    href: '/departments/marketing',
  },
  {
    name: 'customer-service',
    label: 'Chăm sóc Khách hàng (CSKH)',
    Icon: IconCSKH,
    desc: 'Xử lý yêu cầu nhất quán 24/7 theo tài liệu duyệt và chuyển giao đúng ngoại lệ cho chuyên viên.',
    href: '/departments/customer-service',
  },
  {
    name: 'operations',
    label: 'Phòng Vận hành (Operations)',
    Icon: IconOperations,
    desc: 'Tự động luân chuyển tác vụ, kiểm tra điều kiện quy tắc và quản trị hàng đợi công việc.',
    href: '/departments/operations',
    badge: 'Quy trình cốt lõi',
  },
  {
    name: 'finance',
    label: 'Tài chính & Kế toán (Finance)',
    Icon: IconFinance,
    desc: 'Hỗ trợ thu thập, chuẩn hóa, đối chiếu dữ liệu giao dịch trước khi con người ra quyết định thanh toán.',
    href: '/departments/finance',
  },
  {
    name: 'hr',
    label: 'Nhân sự & Nội bộ (HR)',
    Icon: IconHR,
    desc: 'Hỗ trợ cẩm nang quy chế nội bộ, giải đáp chính sách và luân chuyển phiếu đề xuất nhân sự.',
    href: '/departments/hr',
  },
];

export function RelatedDepartments({
  title = 'Khám phá các phòng ban khác',
  subtitle = 'Nexagnet có thể bắt đầu từ một quy trình cụ thể rồi mở rộng sang các bộ phận khác trong doanh nghiệp.',
  currentDeptSlug,
}: RelatedDepartmentsProps) {
  const filtered = ALL_DEPARTMENTS.filter((d) => d.name !== currentDeptSlug);

  return (
    <section className="related-departments-section" aria-label="Các phòng ban liên quan">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>HỆ SINH THÁI PHÒNG BAN</span>
          </div>
          <h2 className="section-headline">{title}</h2>
          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="related-departments-grid">
          {filtered.map((d, idx) => {
            const { Icon } = d;
            return (
              <Link key={idx} href={d.href} className="related-dept-card">
                <div className="card-top">
                  <div className="dept-icon-box">
                    <Icon size={20} color="var(--text-primary)" />
                  </div>
                  {d.badge && <span className="dept-badge">{d.badge}</span>}
                </div>
                <h3 className="dept-title">{d.label}</h3>
                <p className="dept-desc">{d.desc}</p>
                <div className="dept-link-action">
                  <span>Xem luồng quy trình</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="footer-arrow">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
