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

interface DepartmentCardItem {
  id: string;
  name: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;
  tagline: string;
  desc: string;
  href: string;
  badge?: string;
  isFeatured?: boolean;
  workflows: string[];
}

const DEPARTMENTS: DepartmentCardItem[] = [
  {
    id: 'executive',
    name: 'Executive',
    label: 'Ban Giám đốc',
    Icon: IconExecutive,
    tagline: 'Nhìn toàn cảnh hoạt động và những việc cần sự can thiệp.',
    desc: 'Lọc nhiễu vận hành, theo dõi tiến độ các quy trình chính, nhận cảnh báo sớm về các điểm nghẽn và phê duyệt các ngoại lệ quan trọng.',
    href: '/departments/executive',
    badge: 'Dành cho Chủ doanh nghiệp',
    isFeatured: true,
    workflows: ['Lọc nhiễu vận hành', 'Hàng đợi cần chú ý', 'Phê duyệt cấp cao'],
  },
  {
    id: 'sales',
    name: 'Sales',
    label: 'Phòng Bán hàng',
    Icon: IconSales,
    tagline: 'Giảm thao tác lặp lại từ lead đến xử lý yêu cầu bán hàng.',
    desc: 'Tự động đọc hiểu tin nhắn hỏi giá, bóc tách đơn hàng gõ vội, đối soát bảng giá đại lý và kiểm tra hạn mức công nợ an toàn.',
    href: '/departments/sales',
    workflows: ['Tiếp nhận báo giá', 'Bóc tách đơn hàng', 'Đối soát công nợ'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    label: 'Phòng Tiếp thị',
    Icon: IconMarketing,
    tagline: 'Biến dữ liệu và tương tác khách hàng thành workflow có thể theo dõi.',
    desc: 'Hợp nhất phản hồi khách hàng, phân loại lead theo nhu cầu, điều phối chiến dịch thông báo chính sách mới theo hàng đợi an toàn.',
    href: '/departments/marketing',
    workflows: ['Phân loại lead', 'Điều phối chiến dịch', 'Đồng bộ phản hồi'],
  },
  {
    id: 'customer-service',
    name: 'Customer Service',
    label: 'Chăm sóc Khách hàng',
    Icon: IconCSKH,
    tagline: 'Xử lý yêu cầu nhất quán và chuyển đúng ngoại lệ cho nhân viên.',
    desc: 'Phản hồi câu hỏi tiêu chuẩn 24/7 theo cẩm nang dịch vụ đã duyệt, tự động gom hồ sơ và chuyển giao các khiếu nại phức tạp cho chuyên viên.',
    href: '/departments/customer-service',
    workflows: ['Giải đáp 24/7', 'Tra cứu chính sách', 'Chuyển giao chuyên viên'],
  },
  {
    id: 'operations',
    name: 'Operations',
    label: 'Phòng Vận hành',
    Icon: IconOperations,
    tagline: 'Tự động luân chuyển công việc, kiểm tra điều kiện và quản lý ngoại lệ.',
    desc: 'Biến các quy trình giao việc qua chat thành workflow có trạng thái rõ ràng, kiểm tra điều kiện xuất kho và kiểm soát hàng đợi công việc.',
    href: '/departments/operations',
    badge: 'Quy trình Cốt lõi',
    isFeatured: true,
    workflows: ['Luân chuyển tác vụ', 'Kiểm tra điều kiện', 'Quản lý hàng việc'],
  },
  {
    id: 'finance',
    name: 'Finance & Accounting',
    label: 'Tài chính & Kế toán',
    Icon: IconFinance,
    tagline: 'Hỗ trợ thu thập, kiểm tra và luân chuyển dữ liệu trước khi con người quyết định.',
    desc: 'Chuẩn hóa số liệu đơn hàng, đối chiếu chứng từ thanh toán, phát hiện thiếu thông tin và chuyển yêu cầu duyệt tới đúng người có thẩm quyền.',
    href: '/departments/finance',
    workflows: ['Thu thập dữ liệu', 'Đối soát chứng từ', 'Chuyển duyệt thanh toán'],
  },
  {
    id: 'hr',
    name: 'Human Resources',
    label: 'Nhân sự & Nội bộ',
    Icon: IconHR,
    tagline: 'Hỗ trợ các quy trình nội bộ, tri thức nhân sự và yêu cầu nhân viên.',
    desc: 'Giải đáp nhanh cẩm nang quy chế doanh nghiệp, hỗ trợ tiếp nhận đề xuất nội bộ và chuyển giao phiếu phê duyệt cho quản lý.',
    href: '/departments/hr',
    workflows: ['Cẩm nang quy chế', 'Tiếp nhận đề xuất', 'Phê duyệt nội bộ'],
  },
];

export function HomeDepartmentsGrid() {
  return (
    <section className="home-departments-section" id="departments" aria-label="Ứng dụng theo phòng ban">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span className="mono-label">ỨNG DỤNG THEO PHÒNG BAN</span>
          </div>

          <h2 className="section-headline">
            Mỗi phòng ban có một bài toán khác nhau.
          </h2>

          <p className="section-subheadline">
            Nexagnet có thể bắt đầu từ một quy trình cụ thể trong một bộ phận, sau đó mở rộng sang các phòng ban khác trên cùng một hạ tầng vận hành.
          </p>
        </div>

        {/* Structured Department Cards Grid */}
        <div className="departments-cards-grid">
          {DEPARTMENTS.map((dept) => {
            const { Icon } = dept;
            return (
              <Link
                key={dept.id}
                href={dept.href}
                className={`dept-landing-card ${dept.isFeatured ? 'card-featured' : ''}`}
              >
                <div className="card-top-row">
                  <div className="dept-icon-box">
                    <Icon size={20} color="var(--text-primary)" />
                  </div>
                  {dept.badge && <span className="dept-badge-pill">{dept.badge}</span>}
                </div>

                <div className="dept-title-group">
                  <span className="dept-code-tag">{dept.name}</span>
                  <h3 className="dept-label-title">{dept.label}</h3>
                </div>

                <div className="dept-tagline-text">{dept.tagline}</div>
                <p className="dept-desc-text">{dept.desc}</p>

                <div className="dept-workflows-wrap">
                  {dept.workflows.map((wf, idx) => (
                    <span key={idx} className="wf-tag-pill">
                      {wf}
                    </span>
                  ))}
                </div>

                <div className="dept-card-footer-action">
                  <span className="footer-link-label">Xem chi tiết giải pháp</span>
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
