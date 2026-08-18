import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PlatformHero } from '@/components/platform/PlatformHero';
import { PlatformIntegrationsVisual } from '@/components/platform/PlatformHeroVisuals';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Hạ tầng Tích hợp & Kết nối Hệ thống | nexagnet',
  description:
    'Triết lý kết nối mở của nexagnet: Không yêu cầu doanh nghiệp thay thế hệ thống cũ, sẵn sàng tích hợp với các kênh giao tiếp và phần mềm quản trị theo lộ trình.',
  alternates: {
    canonical: 'https://nexagnet247.com/platform/integrations',
  },
};

const INTEGRATION_CATEGORIES = [
  {
    icon: 'chat',
    title: 'Kênh Giao tiếp Hội thoại',
    desc: 'Tiếp nhận tin nhắn tự nhiên từ các nền tảng chat phổ biến mà không làm thay đổi thói quen của khách hàng và đối tác.',
    badge: 'ĐANG CHẠY THỰC TẾ',
    bullets: [
      'Zalo (Nhóm đối tác, Tin nhắn 1-1, Zalo OA)',
      'Web Chat & Cổng tương tác trực tuyến',
      'Cơ chế Co-pilot dán tay dự phòng an toàn',
    ],
  },
  {
    icon: 'integration',
    title: 'Phần mềm Quản trị & ERP (Tùy chọn kết nối)',
    desc: 'Hỗ trợ đồng bộ dữ liệu đơn hàng và tồn kho qua cổng kết nối ErpPort chuẩn hóa khi doanh nghiệp có nhu cầu mở rộng.',
    badge: 'TÙY CHỌN CẤU HÌNH / ERP PORT',
    bullets: [
      'Giai đoạn 1: Thông báo Sales nhập liệu KiotViet / SAP thủ công',
      'Giai đoạn 2+: Cổng ErpPort sẵn sàng kết nối API với KiotViet, SAP, Bravo, MISA, Base',
      'Định tuyến fail-safe bảo vệ dữ liệu gốc',
    ],
  },
  {
    icon: 'knowledge',
    title: 'Cơ sở Dữ liệu & Nguồn sự thật',
    desc: 'Lưu trữ và quản trị tập trung danh mục sản phẩm, bảng giá, hạn mức công nợ và glossary từ điển đóng.',
    badge: 'SẴN SÀNG TRIỂN KHAI',
    bullets: [
      'Cơ sở dữ liệu quan hệ (PostgreSQL / Prisma)',
      'Bảng điều khiển quản trị Admin Panel cho nhân sự',
      'Đồng bộ dữ liệu tức thì không cần khởi động lại',
    ],
  },
  {
    icon: 'ai',
    title: 'Mô hình Trí tuệ Nhân tạo (AI Providers)',
    desc: 'Hỗ trợ linh hoạt các mô hình ngôn ngữ lớn hàng đầu với cơ chế kiểm soát dữ liệu và prompt bảo mật.',
    badge: 'SẴN SÀNG TRIỂN KHAI',
    bullets: [
      'Codex API (Tool-use với JSON Schema đóng)',
      'Tùy chọn kết nối mô hình On-premise cho doanh nghiệp lớn',
      'Tối thiểu hóa dữ liệu truyền tải theo Luật 91/2025/QH15',
    ],
  },
];

const INTEGRATION_FAQS = [
  {
    q: 'Doanh nghiệp có cần phải thay thế phần mềm ERP/KiotViet đang dùng không?',
    a: 'Hoàn toàn không. Triết lý của nexagnet là bổ trợ chứ không thay thế. Trong giai đoạn đầu, hệ thống xử lý khâu bóc tách và đối soát trên Zalo, sau đó tạo Hàng việc để nhân viên Sales nhập vào KiotViet/ERP. Khi doanh nghiệp muốn tự động hóa hoàn toàn, nexagnet sẽ kết nối qua cổng API ErpPort.',
  },
  {
    q: 'Nếu kênh Zalo gặp sự cố hoặc mất kết nối thì hệ thống xử lý thế nào?',
    a: 'nexagnet trang bị sẵn cơ chế Co-pilot (dán tay dự phòng). Nhân viên có thể copy tin nhắn từ Zalo dán vào giao diện điều hành để AI xử lý và bóc tách ngay lập tức mà không làm gián đoạn công việc.',
  },
  {
    q: 'nexagnet có thể tích hợp với các phần mềm kế toán nội bộ tự viết không?',
    a: 'Có. Nền tảng cung cấp hệ thống REST API và Webhook chuẩn hóa, cho phép đội ngũ kỹ thuật của doanh nghiệp dễ dàng đẩy/nhận dữ liệu đơn hàng và trạng thái tồn kho.',
  },
];

export default function PlatformIntegrationsPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PlatformHero
          breadcrumbs={[{ label: 'Nền tảng', href: '/platform' }, { label: 'Hạ tầng Tích hợp' }]}
          eyebrow="KẾT NỐI HỆ THỐNG / INTEGRATIONS"
          badge="KẾT NỐI LINH HOẠT"
          title="Triết lý kết nối: Bổ trợ chứ không thay thế."
          subtitle="nexagnet được thiết kế để hòa nhập mượt mà vào hệ thống công nghệ sẵn có của doanh nghiệp — từ các nhóm chat trao đổi hàng ngày đến cơ sở dữ liệu và phần mềm quản trị."
          primaryCtaText="Yêu cầu Tư vấn Tích hợp"
          supportingPill="Kết nối Zalo đa kênh · Cổng ErpPort linh hoạt · Không xáo trộn vận hành"
          visual={<PlatformIntegrationsVisual />}
        />

        <FeatureGrid
          eyebrow="DANH MỤC KHẢ NĂNG KẾT NỐI"
          title="Minh bạch trạng thái tích hợp của từng phân hệ."
          subtitle="Chúng tôi phân định rõ ràng giữa các tính năng đã hoạt động thực tế và các tùy chọn mở rộng theo lộ trình của doanh nghiệp."
          features={INTEGRATION_CATEGORIES}
          columns={2}
        />

        <ControlCallout
          title="An toàn dữ liệu trong mọi luồng tích hợp."
          desc="nexagnet áp dụng cơ chế xác thực bảo mật, mã hóa đường truyền và lưu vết kiểm toán cho mọi giao dịch truyền nhận dữ liệu giữa các hệ thống."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Khám phá thêm về kiến trúc nền tảng và cơ chế kiểm soát của nexagnet."
          items={[
            {
              title: 'Tổng quan Nền tảng (Platform)',
              desc: 'Xem sơ đồ kiến trúc tổng thể từ tiếp nhận đến thực thi.',
              href: '/platform',
            },
            {
              title: 'Kiểm soát & Quản trị (Control & Governance)',
              desc: 'Chi tiết về Rules Engine, Nhật ký kiểm toán, Phân quyền RBAC và Kill-switch.',
              href: '/platform/control',
              badge: 'Trọng tâm',
            },
            {
              title: 'Lộ trình Phát triển (Roadmap)',
              desc: 'Định hướng mở rộng hệ sinh thái các module vận hành của nexagnet.',
              href: '/resources/roadmap',
            },
          ]}
        />

        <FAQAccordion items={INTEGRATION_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
