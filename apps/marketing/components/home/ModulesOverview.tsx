'use client';

import Link from 'next/link';

interface ModuleItem {
  id: string;
  name: string;
  badge?: string;
  isFeatured?: boolean;
  status: string;
  desc: string;
  capabilities: string[];
  href?: string;
}

const MODULES: ModuleItem[] = [
  {
    id: 'order-automation',
    name: 'Order Automation',
    badge: 'SẢN PHẨM TIÊU BIỂU',
    isFeatured: true,
    status: 'Đang chạy thực tế',
    desc: 'Tự động hóa xử lý đơn hàng từ hội thoại Zalo & đa kênh. Đọc hiểu tin nhắn viết tắt, đối soát bảng giá đối tác, chính sách thương mại và soạn đơn chuẩn xác.',
    capabilities: [
      'Bóc tách SKU, số lượng, địa chỉ từ tin nhắn tự nhiên',
      'Đối soát giá theo cấp đại lý & hạn mức công nợ',
      'Tự động gửi xác nhận hoặc chuyển giao Sales duyệt',
    ],
    href: '/products/order-automation',
  },
  {
    id: 'knowledge',
    name: 'Knowledge Base',
    status: 'Sẵn sàng triển khai',
    desc: 'Hỗ trợ tra cứu chính sách bảo hành, tài liệu kỹ thuật, catalogue sản phẩm với câu trả lời trích dẫn nguồn văn bản nội bộ đã duyệt.',
    capabilities: [
      'Truy xuất từ tài liệu PDF, Docs, Bảng giá chuẩn',
      'Đối chiếu điều khoản có căn cứ rõ ràng',
      'Cập nhật tri thức tập trung không cần train lại model',
    ],
  },
  {
    id: 'campaigns',
    name: 'Campaigns Dispatch',
    status: 'Sẵn sàng triển khai',
    desc: 'Lên lịch và gửi thông báo chính sách, chương trình khuyến mãi định kỳ tới các nhóm Zalo/kênh liên lạc với cơ chế giãn cách an toàn.',
    capabilities: [
      'Phân bổ hàng đợi giãn cách thời gian (Pacing)',
      'Cá nhân hóa nội dung theo từng đại lý/khách hàng',
      'Nhật ký gửi tin và báo cáo tỷ lệ tiếp nhận',
    ],
  },
  {
    id: 'customer-care',
    name: 'Customer Care & Handoff',
    status: 'Sẵn sàng triển khai',
    desc: 'Tiếp nhận yêu cầu hỗ trợ 24/7, phân loại mức độ khẩn cấp và chuyển giao thông minh cho nhân sự chuyên trách kèm tóm tắt hội thoại.',
    capabilities: [
      'Nhận diện 7 loại ý định khách hàng tức thì',
      'Tự động chuyển tiếp vào hàng việc của nhân sự',
      'Không gián đoạn trải nghiệm giao tiếp của khách hàng',
    ],
  },
  {
    id: 'rules-control',
    name: 'Rules & Governance',
    status: 'Cốt lõi nền tảng',
    desc: 'Lớp kiểm soát nghiệp vụ tập trung: cấu hình bảng giá, ngưỡng tự động hóa, quy chế duyệt và công tắc khẩn cấp (kill-switch).',
    capabilities: [
      'Cài đặt ngưỡng số lượng / giá trị tự động gửi',
      'Quản trị vai trò và phân quyền nhân sự',
      'Ghi vết kiểm toán (Audit Trail) toàn diện',
    ],
  },
  {
    id: 'custom-workflows',
    name: '+ Custom Workflows',
    status: 'Khả năng mở rộng',
    desc: 'Tích hợp nhanh chóng các quy trình đặc thù như Báo giá tức thì, Đối soát công nợ định kỳ, hay Điều phối giao vận trên cùng hạ tầng bảo mật.',
    capabilities: [
      'Thiết kế luồng quy tắc theo bài toán riêng',
      'Kết nối API/Webhook tới hệ thống ERP nội bộ',
      'Mở rộng linh hoạt khi doanh nghiệp sẵn sàng',
    ],
  },
];

export function ModulesOverview() {
  return (
    <section className="modules-overview-section" id="modules" aria-label="Các phân hệ vận hành nexagnet">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>DANH MỤC PHÂN HỆ VẬN HÀNH</span>
          </div>

          <h2 className="section-headline">
            Mở rộng theo từng module bạn cần.
          </h2>

          <p className="section-subheadline">
            Không cần phải đầu tư thay thế toàn bộ hệ thống cùng lúc. Doanh nghiệp có thể bắt đầu từ một module giải quyết ngay điểm nghẽn hiện tại, và mở rộng thêm các module tiếp theo trên cùng một hạ tầng.
          </p>
        </div>

        <div className="modules-cards-grid">
          {MODULES.map((mod) => (
            <div
              key={mod.id}
              className={`module-overview-card ${mod.isFeatured ? 'featured-module-card' : ''}`}
            >
              <div className="mod-card-header">
                <div className="mod-header-left">
                  {mod.badge && <span className="featured-badge">{mod.badge}</span>}
                  <span className="mod-status-label">● {mod.status}</span>
                </div>
              </div>

              <h3 className="mod-card-name">{mod.name}</h3>
              <p className="mod-card-desc">{mod.desc}</p>

              <div className="mod-caps-list">
                {mod.capabilities.map((cap, cIdx) => (
                  <div key={cIdx} className="mod-cap-line">
                    <span className="cap-bullet">✓</span>
                    <span>{cap}</span>
                  </div>
                ))}
              </div>

              {mod.href ? (
                <div className="mod-card-action">
                  <Link href={mod.href} className="btn-primary mod-action-btn">
                    <span>Xem sản phẩm tiêu biểu: {mod.name}</span>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              ) : (
                <div className="mod-card-action">
                  <span className="mod-ready-tag">Tích hợp sẵn trong nền tảng</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
